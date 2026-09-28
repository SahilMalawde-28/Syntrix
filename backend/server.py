"""
Syntrix Cloud — Central Backend

Polls the Supabase `jobs` table for rows with status == 'pending'. For each
job, resolves the target (a group, lab, or single hostname) into the actual
`devices` rows it covers, then dispatches each device INDEPENDENTLY:

  1. Ping/TCP-reachability check first, before ever invoking Ansible.
  2. Unreachable  -> mark that device offline in Supabase, record this one
     host as 'queued_offline' in job_host_status, and move on — it does NOT
     block or fail the other devices in the same job.
  3. Reachable    -> run main.py scoped to just that host (--target
     <hostname>). Real task failure -> 'failed'. Success -> 'success'.

A separate retry sweep (RETRY_INTERVAL_SECONDS, independent of the main
poll cadence) periodically re-pings every 'queued_offline' host and
re-attempts its original command once it's back online.

The parent `jobs` row's overall status is derived from all its
job_host_status rows: 'failed' if any host genuinely failed, 'partial' if
any are still queued_offline (waiting on a device), else 'completed'.

Run standalone:
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

import asyncio
import logging
import os
import shlex
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# main.py, controllers/, utils/, playbooks/, inventory/ all live in this
# same folder as server.py now.
AUTOMATION_ROOT = os.environ.get("AUTOMATION_ROOT", "/app")
PYTHON_BIN = os.environ.get("AUTOMATION_PYTHON_BIN", "python3")

# New-job pickup cadence. Deliberately slow (default 5 min) since most jobs
# arrive via the "sync now" trigger (POST /sync-now) rather than needing to
# be caught by a tight poll loop. This is just the safety-net fallback.
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "300"))

# How often offline devices get re-pinged and their queued commands
# retried. Independent of, and much faster than, POLL_INTERVAL_SECONDS —
# there's no reason to make a technician wait 5 minutes to find out a PC
# came back online.
RETRY_INTERVAL_SECONDS = float(os.environ.get("RETRY_INTERVAL_SECONDS", "60"))

JOB_TIMEOUT_SECONDS = float(os.environ.get("JOB_TIMEOUT_SECONDS", "1800"))  # 30 min
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "5"))
PING_TIMEOUT_SECONDS = float(os.environ.get("PING_TIMEOUT_SECONDS", "2"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("syntrix-backend")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# utils/csv_store.py lives right next to this file (same AUTOMATION_ROOT),
# so import its ping/inventory logic directly instead of duplicating it.
sys.path.insert(0, AUTOMATION_ROOT)
from utils.csv_store import ping_host, rebuild_hosts_ini  # noqa: E402

# Woken immediately by POST /sync-now, instead of waiting for the next
# scheduled poll — this is the "sync now button" hook.
_poll_now = asyncio.Event()

# ---------------------------------------------------------------------------
# CLI argument building
#
# main.py currently wires up three domains (user, telemetry, monitor), each
# with its own argparse sub-parser and flag set. We map `params` JSON keys
# onto the exact flags each sub-parser expects. Any domain not listed here
# (e.g. future 'software' / 'system' / 'patch' controllers) falls through to
# a generic mapper that turns every params key into a `--key-with-dashes
# value` flag, so new domains work without touching this file as long as
# their argparse flags follow the same underscore/dash convention main.py
# already uses (e.g. dest="password_hash" <-> --password-hash).
# ---------------------------------------------------------------------------
KNOWN_DOMAIN_FLAGS: dict[str, list[str]] = {
    "user": ["target", "username", "group", "command", "password", "password_hash"],
    "telemetry": ["target", "process_name"],
    "monitor": ["target", "process_name"],
}


def _flag_name(key: str) -> str:
    return "--" + key.replace("_", "-")


def build_cli_args(job: dict[str, Any]) -> list[str]:
    """Translate a job row into `python3 main.py <domain> <action> [flags...]`."""
    domain = job["domain"]
    action = job["action"]
    params: dict[str, Any] = dict(job.get("params") or {})

    # Backwards-compatible: a bare `command` string (e.g. a package name)
    # gets folded into params as `command` unless params already set one.
    if job.get("command") and "command" not in params:
        params["command"] = job["command"]

    # `target` defaults to 'all' just like main.py's argparse default.
    params.setdefault("target", job.get("target") or "all")

    allowed_keys = KNOWN_DOMAIN_FLAGS.get(domain)
    args = [AUTOMATION_ROOT + "/main.py", domain, action]

    for key, value in params.items():
        if value is None or value == "":
            continue
        if allowed_keys is not None and key not in allowed_keys:
            # Skip params the known sub-parser doesn't accept, rather than
            # letting argparse blow up the whole job with "unrecognized
            # arguments".
            log.warning("Dropping unsupported param '%s' for domain '%s'", key, domain)
            continue
        args.append(_flag_name(key))
        args.append(str(value))

    return args


def build_cli_args_for_host(job: dict[str, Any], hostname: str) -> list[str]:
    """Same as build_cli_args, but forces --target to one specific host —
    this is what makes per-device dispatch possible: one job covering a
    group of 20 machines becomes 20 independent `--target <hostname>`
    invocations, each with its own pass/fail/offline outcome."""
    job_for_host = dict(job)
    params = dict(job.get("params") or {})
    params["target"] = hostname
    job_for_host["params"] = params
    job_for_host["target"] = hostname
    return build_cli_args(job_for_host)


def resolve_target_devices(target: str) -> list[dict[str, Any]]:
    """Expand a job's `target` (a group name, lab_id, single hostname, or
    'all') into the actual Supabase `devices` rows it covers."""
    result = supabase.table("devices").select("*").execute()
    devices = result.data or []

    if not target or target == "all":
        return devices

    return [
        d for d in devices
        if target == d.get("lab_id")
        or target == d.get("hostname")
        or target in (d.get("groups") or [])
    ]


# ---------------------------------------------------------------------------
# Job execution
# ---------------------------------------------------------------------------
_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)


def _execute_subprocess(cli_args: list[str], timeout: float) -> tuple[str, int]:
    """
    Blocking subprocess execution — runs in a worker thread via
    asyncio.to_thread(). This avoids asyncio's own subprocess machinery
    (create_subprocess_exec), which needs the Proactor event loop on
    Windows and can silently end up on the Selector loop instead (e.g.
    under uvicorn --reload), raising NotImplementedError. subprocess.run
    has no such event-loop dependency, on any platform.
    """
    import subprocess

    try:
        result = subprocess.run(
            [PYTHON_BIN, *cli_args],
            cwd=AUTOMATION_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
        )
        return result.stdout.decode(errors="replace"), result.returncode
    except subprocess.TimeoutExpired as exc:
        partial = (exc.stdout or b"").decode(errors="replace")
        return partial + f"\nJob timed out after {timeout}s and was killed.", -1


async def _dispatch_host(job: dict[str, Any], device: dict[str, Any]) -> None:
    """Ping one device; either mark it queued_offline, or actually run the
    job's command against it and record success/failed. Never raises —
    every path writes a job_host_status row so the job can't get stuck."""
    job_id = job["id"]
    hostname = device["hostname"]

    reachable = await asyncio.to_thread(
        ping_host, device.get("ip_address", ""), device.get("os_type", "linux")
    )

    if not reachable:
        supabase.table("devices").update({"is_online": False}).eq("hostname", hostname).execute()
        supabase.table("job_host_status").upsert(
            {
                "job_id": job_id,
                "hostname": hostname,
                "status": "queued_offline",
                "output": "Device unreachable (ping/TCP check failed). "
                          "Will retry automatically once it's back online.",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="job_id,hostname",
        ).execute()
        log.info("Job %s: %s is offline, queued for retry", job_id, hostname)
        return

    supabase.table("devices").update({"is_online": True}).eq("hostname", hostname).execute()

    cli_args = build_cli_args_for_host(job, hostname)
    log.info("Job %s -> %s [host=%s]", job_id, shlex.join([PYTHON_BIN, *cli_args]), hostname)

    output_log, exit_code = await asyncio.to_thread(
        _execute_subprocess, cli_args, JOB_TIMEOUT_SECONDS
    )
    # Reachable but the command itself failed -> a REAL failure, not an
    # offline/retry situation. Per the spec: ping ok + command fails = failed.
    status = "success" if exit_code == 0 else "failed"

    supabase.table("job_host_status").upsert(
        {
            "job_id": job_id,
            "hostname": hostname,
            "status": status,
            "output": output_log,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="job_id,hostname",
    ).execute()
    log.info("Job %s: %s finished with status=%s", job_id, hostname, status)


def _finalize_job_status(job_id: str) -> None:
    """Recompute the parent job's overall status from all its
    job_host_status rows. Called after every dispatch AND every retry, so
    a job that starts 'partial' correctly becomes 'completed' later once
    its last offline device finally comes back and succeeds."""
    rows = supabase.table("job_host_status").select("*").eq("job_id", job_id).execute().data or []
    if not rows:
        return

    statuses = [r["status"] for r in rows]
    if any(s == "failed" for s in statuses):
        overall = "failed"
    elif any(s == "queued_offline" for s in statuses):
        overall = "partial"
    else:
        overall = "completed"

    aggregated = "\n\n".join(
        f"=== {r['hostname']} [{r['status']}] ===\n{r.get('output') or ''}" for r in rows
    )

    update = {"status": overall, "output_log": aggregated}
    if overall in ("completed", "failed"):
        update["finished_at"] = datetime.now(timezone.utc).isoformat()
        update["exit_code"] = 0 if overall == "completed" else 1
    supabase.table("jobs").update(update).eq("id", job_id).execute()


async def run_job(job: dict[str, Any]) -> None:
    job_id = job["id"]
    async with _semaphore:
        try:
            supabase.table("jobs").update(
                {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", job_id).execute()

            devices = await asyncio.to_thread(resolve_target_devices, job.get("target") or "all")

            if not devices:
                supabase.table("jobs").update(
                    {
                        "status": "failed",
                        "output_log": f"No devices matched target '{job.get('target')}'.",
                        "exit_code": 1,
                        "finished_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", job_id).execute()
                return

            # Seed a row per device up front so the UI can show "pending"
            # for all of them immediately, not just as each one finishes.
            for d in devices:
                supabase.table("job_host_status").upsert(
                    {"job_id": job_id, "hostname": d["hostname"], "status": "pending"},
                    on_conflict="job_id,hostname",
                ).execute()

            await asyncio.gather(*[_dispatch_host(job, d) for d in devices])
            await asyncio.to_thread(_finalize_job_status, job_id)

        except Exception as exc:  # noqa: BLE001 - surface any failure to the row
            log.exception("Job %s crashed", job_id)
            supabase.table("jobs").update(
                {
                    "status": "failed",
                    "output_log": f"Backend error: {exc}",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", job_id).execute()


async def retry_sweep_loop() -> None:
    """Independent of the main poll loop. Every RETRY_INTERVAL_SECONDS,
    re-pings every device stuck in 'queued_offline' and re-attempts its
    original command if it's back online."""
    log.info("Retry sweep running every %.0fs", RETRY_INTERVAL_SECONDS)
    while True:
        await asyncio.sleep(RETRY_INTERVAL_SECONDS)
        try:
            queued = (
                supabase.table("job_host_status")
                .select("*")
                .eq("status", "queued_offline")
                .execute()
                .data or []
            )
            for row in queued:
                asyncio.create_task(_retry_one(row))
        except Exception:  # noqa: BLE001
            log.exception("Retry sweep error")


async def _retry_one(host_status_row: dict[str, Any]) -> None:
    job_id = host_status_row["job_id"]
    hostname = host_status_row["hostname"]

    job_result = supabase.table("jobs").select("*").eq("id", job_id).single().execute()
    job = job_result.data
    if not job:
        return  # parent job deleted; nothing to retry

    device_result = supabase.table("devices").select("*").eq("hostname", hostname).single().execute()
    device = device_result.data
    if not device:
        return  # device deleted from inventory; nothing to retry

    await _dispatch_host(job, device)
    await asyncio.to_thread(_finalize_job_status, job_id)


async def poll_loop() -> None:
    log.info(
        "Polling Supabase jobs table every %.0fs (or immediately on /sync-now) "
        "(automation_root=%s)",
        POLL_INTERVAL_SECONDS,
        AUTOMATION_ROOT,
    )
    while True:
        try:
            result = (
                supabase.table("jobs")
                .select("*")
                .eq("status", "pending")
                .order("created_at")
                .limit(20)
                .execute()
            )
            pending_jobs = result.data or []
            for job in pending_jobs:
                asyncio.create_task(run_job(job))
        except Exception:  # noqa: BLE001 - never let the loop die
            log.exception("Error while polling jobs table")

        try:
            await asyncio.wait_for(_poll_now.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass
        finally:
            _poll_now.clear()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    poll_task = asyncio.create_task(poll_loop())
    retry_task = asyncio.create_task(retry_sweep_loop())
    yield
    poll_task.cancel()
    retry_task.cancel()


app = FastAPI(title="Syntrix Cloud Backend", lifespan=lifespan)

# Lets a browser-based "Sync now" button call POST /sync-now directly.
# Wide open (*) since this is an internal tool on the college network, not
# a public API — tighten to your actual frontend origin if that changes.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/sync-now")
async def sync_now() -> dict[str, str]:
    """The 'Sync Now' button hook — wakes the poll loop immediately instead
    of waiting up to POLL_INTERVAL_SECONDS for the next scheduled check."""
    _poll_now.set()
    return {"status": "triggered"}


@app.post("/inventory/refresh")
async def inventory_refresh() -> dict[str, Any]:
    """Manually trigger a hosts.ini rebuild, using the SAME function
    main.py uses internally (utils/csv_store.rebuild_hosts_ini)."""
    await asyncio.to_thread(rebuild_hosts_ini)
    return {"status": "ok"}


@app.get("/inventory")
async def inventory_preview() -> dict[str, str]:
    """Return the current generated hosts.ini, for debugging."""
    path = os.path.join(AUTOMATION_ROOT, "inventory", "hosts.ini")
    try:
        with open(path) as fh:
            return {"path": path, "content": fh.read()}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Inventory not generated yet — run one job first")


@app.post("/jobs/{job_id}/run-now")
async def run_now(job_id: str) -> dict[str, str]:
    """Manual trigger, mostly for debugging outside the normal poll cadence."""
    result = supabase.table("jobs").select("*").eq("id", job_id).single().execute()
    job = result.data
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Job status is '{job['status']}', not 'pending'")
    asyncio.create_task(run_job(job))
    return {"status": "triggered"}
