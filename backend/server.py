"""
Syntrix Cloud — Central Backend

Polls the Supabase `jobs` table for rows with status == 'pending'. For each
job, resolves the target (a group, lab, or single hostname) into the actual
`devices` rows it covers, then dispatches each device INDEPENDENTLY:

  1. Local pseudo-hosts (wsl_local / win_local) are always considered reachable.
     Real remote hosts are checked using ping/TCP reachability.
  2. Unreachable remote host -> mark that device offline in Supabase,
     record this host as 'queued_offline' in job_host_status, and move on.
  3. Reachable -> run main.py scoped to just that host (--target <hostname>).
     Real task failure -> 'failed'. Success -> 'success'.

A separate retry sweep (RETRY_INTERVAL_SECONDS, independent of the main
poll cadence) periodically re-pings every 'queued_offline' host and
re-attempts its original command once it's back online.

The parent `jobs` row's overall status is derived from all its
job_host_status rows.

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

AUTOMATION_ROOT = os.environ.get("AUTOMATION_ROOT", "/app")
PYTHON_BIN = os.environ.get("AUTOMATION_PYTHON_BIN", "python3")

# Safety-net fallback for picking up pending jobs.
# Normal "Sync Now" requests wake the poller immediately.
POLL_INTERVAL_SECONDS = float(
    os.environ.get("POLL_INTERVAL_SECONDS", "300")
)

# Retry offline remote devices independently.
RETRY_INTERVAL_SECONDS = float(
    os.environ.get("RETRY_INTERVAL_SECONDS", "60")
)

JOB_TIMEOUT_SECONDS = float(
    os.environ.get("JOB_TIMEOUT_SECONDS", "1800")
)

MAX_CONCURRENT_JOBS = int(
    os.environ.get("MAX_CONCURRENT_JOBS", "5")
)

PING_TIMEOUT_SECONDS = float(
    os.environ.get("PING_TIMEOUT_SECONDS", "2")
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

log = logging.getLogger("syntrix-backend")

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)


# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------

sys.path.insert(0, AUTOMATION_ROOT)

from utils.csv_store import ping_host, rebuild_hosts_ini  # noqa: E402


# ---------------------------------------------------------------------------
# Immediate polling trigger
# ---------------------------------------------------------------------------

_poll_now = asyncio.Event()


# ---------------------------------------------------------------------------
# CLI argument building
# ---------------------------------------------------------------------------

KNOWN_DOMAIN_FLAGS: dict[str, list[str]] = {
    "user": [
        "target",
        "username",
        "group",
        "command",
        "password",
        "password_hash",
    ],
    "telemetry": [
        "target",
        "process_name",
    ],
    "monitor": [
        "target",
        "process_name",
    ],
}


def _flag_name(key: str) -> str:
    return "--" + key.replace("_", "-")


def build_cli_args(job: dict[str, Any]) -> list[str]:
    """
    Translate a job row into:

        python3 main.py <domain> <action> [flags...]
    """

    domain = job["domain"]
    action = job["action"]

    params: dict[str, Any] = dict(
        job.get("params") or {}
    )

    # Backwards-compatible command field.
    if job.get("command") and "command" not in params:
        params["command"] = job["command"]

    params.setdefault(
        "target",
        job.get("target") or "all"
    )

    allowed_keys = KNOWN_DOMAIN_FLAGS.get(domain)

    args = [
        AUTOMATION_ROOT + "/main.py",
        domain,
        action,
    ]

    for key, value in params.items():

        if value is None or value == "":
            continue

        if (
            allowed_keys is not None
            and key not in allowed_keys
        ):
            log.warning(
                "Dropping unsupported param '%s' for domain '%s'",
                key,
                domain
            )
            continue

        args.append(_flag_name(key))
        args.append(str(value))

    return args


def build_cli_args_for_host(
    job: dict[str, Any],
    hostname: str
) -> list[str]:

    """
    Force the job to execute against one specific hostname.
    """

    job_for_host = dict(job)

    params = dict(
        job.get("params") or {}
    )

    params["target"] = hostname

    job_for_host["params"] = params
    job_for_host["target"] = hostname

    return build_cli_args(job_for_host)


# ---------------------------------------------------------------------------
# Device resolution
# ---------------------------------------------------------------------------

def resolve_target_devices(
    target: str
) -> list[dict[str, Any]]:

    """
    Expand target:

        all
        lab_id
        hostname
        group

    into actual device rows.
    """

    result = (
        supabase
        .table("devices")
        .select("*")
        .execute()
    )

    devices = result.data or []

    if not target or target == "all":
        return devices

    return [
        d
        for d in devices
        if (
            target == d.get("lab_id")
            or target == d.get("hostname")
            or target in (d.get("groups") or [])
        )
    ]


# ---------------------------------------------------------------------------
# Job execution
# ---------------------------------------------------------------------------

_semaphore = asyncio.Semaphore(
    MAX_CONCURRENT_JOBS
)


def _execute_subprocess(
    cli_args: list[str],
    timeout: float
) -> tuple[str, int]:

    """
    Blocking subprocess execution.
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

        return (
            result.stdout.decode(errors="replace"),
            result.returncode,
        )

    except subprocess.TimeoutExpired as exc:

        partial = (
            exc.stdout or b""
        ).decode(errors="replace")

        return (
            partial
            + f"\nJob timed out after {timeout}s and was killed.",
            -1,
        )


# ---------------------------------------------------------------------------
# IMPORTANT:
# Local pseudo-host handling
# ---------------------------------------------------------------------------

LOCAL_HOSTNAMES = {
    "wsl_local",
    "win_local",
}

LOCAL_IPS = {
    "wsl_local",
    "win_local",
    "localhost",
    "127.0.0.1",
}


def is_local_pseudo_host(
    hostname: str,
    ip_address: str
) -> bool:

    hostname = str(
        hostname or ""
    ).strip().lower()

    ip_address = str(
        ip_address or ""
    ).strip().lower()

    return (
        hostname in LOCAL_HOSTNAMES
        or ip_address in LOCAL_IPS
    )


# ---------------------------------------------------------------------------
# Dispatch one host
# ---------------------------------------------------------------------------

async def _dispatch_host(
    job: dict[str, Any],
    device: dict[str, Any]
) -> None:

    """
    Dispatch one device.

    Local pseudo-hosts such as wsl_local are ALWAYS considered reachable.

    Real remote devices are checked using ping/TCP reachability.

    IMPORTANT:
    We never allow the reachability check to flip wsl_local offline.
    """

    job_id = job["id"]

    hostname = str(
        device.get("hostname", "")
    ).strip()

    ip_address = str(
        device.get("ip_address", "")
    ).strip()

    # ---------------------------------------------------------
    # LOCAL HOST
    # ---------------------------------------------------------

    if is_local_pseudo_host(
        hostname,
        ip_address
    ):

        reachable = True

        log.info(
            "Job %s: %s identified as local pseudo-host; "
            "skipping network reachability check",
            job_id,
            hostname
        )

    # ---------------------------------------------------------
    # REMOTE HOST
    # ---------------------------------------------------------

    else:

        reachable = await asyncio.to_thread(
            ping_host,
            ip_address,
            device.get(
                "os_type",
                "linux"
            )
        )

    # ---------------------------------------------------------
    # REMOTE HOST UNREACHABLE
    # ---------------------------------------------------------

    if not reachable:

        supabase.table("devices").update(
            {
                "is_online": False
            }
        ).eq(
            "hostname",
            hostname
        ).execute()

        supabase.table("job_host_status").upsert(
            {
                "job_id": job_id,
                "hostname": hostname,
                "status": "queued_offline",
                "output": (
                    "Device unreachable "
                    "(ping/TCP check failed). "
                    "Will retry automatically once "
                    "it is back online."
                ),
                "updated_at": datetime.now(
                    timezone.utc
                ).isoformat(),
            },
            on_conflict="job_id,hostname",
        ).execute()

        log.info(
            "Job %s: %s is offline, "
            "queued for retry",
            job_id,
            hostname
        )

        return

    # ---------------------------------------------------------
    # REACHABLE / LOCAL HOST
    # ---------------------------------------------------------

    # A local pseudo-host is explicitly considered online.
    supabase.table("devices").update(
        {
            "is_online": True
        }
    ).eq(
        "hostname",
        hostname
    ).execute()

    cli_args = build_cli_args_for_host(
        job,
        hostname
    )

    log.info(
        "Job %s -> %s [host=%s]",
        job_id,
        shlex.join(
            [
                PYTHON_BIN,
                *cli_args
            ]
        ),
        hostname
    )

    # ---------------------------------------------------------
    # Execute main.py
    # ---------------------------------------------------------

    output_log, exit_code = await asyncio.to_thread(
        _execute_subprocess,
        cli_args,
        JOB_TIMEOUT_SECONDS
    )

    status = (
        "success"
        if exit_code == 0
        else "failed"
    )

    # ---------------------------------------------------------
    # Store host result
    # ---------------------------------------------------------

    supabase.table(
        "job_host_status"
    ).upsert(
        {
            "job_id": job_id,
            "hostname": hostname,
            "status": status,
            "output": output_log,
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
        },
        on_conflict="job_id,hostname",
    ).execute()

    log.info(
        "Job %s: %s finished with status=%s",
        job_id,
        hostname,
        status
    )


# ---------------------------------------------------------------------------
# Finalize job
# ---------------------------------------------------------------------------

def _finalize_job_status(
    job_id: str
) -> None:

    rows = (
        supabase
        .table("job_host_status")
        .select("*")
        .eq("job_id", job_id)
        .execute()
        .data
        or []
    )

    if not rows:
        return

    statuses = [
        r["status"]
        for r in rows
    ]

    if any(
        s == "failed"
        for s in statuses
    ):
        overall = "failed"

    elif any(
        s == "queued_offline"
        for s in statuses
    ):
        overall = "partial"

    else:
        overall = "completed"

    aggregated = "\n\n".join(
        (
            f"=== {r['hostname']} "
            f"[{r['status']}] ===\n"
            f"{r.get('output') or ''}"
        )
        for r in rows
    )

    update = {
        "status": overall,
        "output_log": aggregated,
    }

    if overall in (
        "completed",
        "failed"
    ):

        update["finished_at"] = (
            datetime.now(
                timezone.utc
            ).isoformat()
        )

        update["exit_code"] = (
            0
            if overall == "completed"
            else 1
        )

    (
        supabase
        .table("jobs")
        .update(update)
        .eq("id", job_id)
        .execute()
    )


# ---------------------------------------------------------------------------
# Run job
# ---------------------------------------------------------------------------

async def run_job(
    job: dict[str, Any]
) -> None:

    job_id = job["id"]

    async with _semaphore:

        try:

            supabase.table("jobs").update(
                {
                    "status": "running",
                    "started_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            ).eq(
                "id",
                job_id
            ).execute()

            devices = await asyncio.to_thread(
                resolve_target_devices,
                job.get("target") or "all"
            )

            if not devices:

                supabase.table("jobs").update(
                    {
                        "status": "failed",
                        "output_log": (
                            f"No devices matched target "
                            f"'{job.get('target')}'."
                        ),
                        "exit_code": 1,
                        "finished_at": datetime.now(
                            timezone.utc
                        ).isoformat(),
                    }
                ).eq(
                    "id",
                    job_id
                ).execute()

                return

            # Seed host rows.
            for d in devices:

                supabase.table(
                    "job_host_status"
                ).upsert(
                    {
                        "job_id": job_id,
                        "hostname": d["hostname"],
                        "status": "pending",
                    },
                    on_conflict="job_id,hostname",
                ).execute()

            await asyncio.gather(
                *[
                    _dispatch_host(job, d)
                    for d in devices
                ]
            )

            await asyncio.to_thread(
                _finalize_job_status,
                job_id
            )

        except Exception as exc:

            log.exception(
                "Job %s crashed",
                job_id
            )

            supabase.table("jobs").update(
                {
                    "status": "failed",
                    "output_log": (
                        f"Backend error: {exc}"
                    ),
                    "finished_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            ).eq(
                "id",
                job_id
            ).execute()


# ---------------------------------------------------------------------------
# Retry sweep
# ---------------------------------------------------------------------------

async def retry_sweep_loop() -> None:

    log.info(
        "Retry sweep running every %.0fs",
        RETRY_INTERVAL_SECONDS
    )

    while True:

        await asyncio.sleep(
            RETRY_INTERVAL_SECONDS
        )

        try:

            queued = (
                supabase
                .table("job_host_status")
                .select("*")
                .eq(
                    "status",
                    "queued_offline"
                )
                .execute()
                .data
                or []
            )

            for row in queued:

                asyncio.create_task(
                    _retry_one(row)
                )

        except Exception:

            log.exception(
                "Retry sweep error"
            )


async def _retry_one(
    host_status_row: dict[str, Any]
) -> None:

    job_id = host_status_row["job_id"]
    hostname = host_status_row["hostname"]

    job_result = (
        supabase
        .table("jobs")
        .select("*")
        .eq("id", job_id)
        .single()
        .execute()
    )

    job = job_result.data

    if not job:
        return

    device_result = (
        supabase
        .table("devices")
        .select("*")
        .eq("hostname", hostname)
        .single()
        .execute()
    )

    device = device_result.data

    if not device:
        return

    await _dispatch_host(
        job,
        device
    )

    await asyncio.to_thread(
        _finalize_job_status,
        job_id
    )


# ---------------------------------------------------------------------------
# Poll loop
# ---------------------------------------------------------------------------

async def poll_loop() -> None:

    log.info(
        "Polling Supabase jobs table every %.0fs "
        "(or immediately on /sync-now) "
        "(automation_root=%s)",
        POLL_INTERVAL_SECONDS,
        AUTOMATION_ROOT,
    )

    while True:

        try:

            result = (
                supabase
                .table("jobs")
                .select("*")
                .eq(
                    "status",
                    "pending"
                )
                .order("created_at")
                .limit(20)
                .execute()
            )

            pending_jobs = (
                result.data or []
            )

            for job in pending_jobs:

                asyncio.create_task(
                    run_job(job)
                )

        except Exception:

            log.exception(
                "Error while polling jobs table"
            )

        try:

            await asyncio.wait_for(
                _poll_now.wait(),
                timeout=POLL_INTERVAL_SECONDS
            )

        except asyncio.TimeoutError:
            pass

        finally:
            _poll_now.clear()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(
    app: FastAPI
):

    poll_task = asyncio.create_task(
        poll_loop()
    )

    retry_task = asyncio.create_task(
        retry_sweep_loop()
    )

    yield

    poll_task.cancel()
    retry_task.cancel()


app = FastAPI(
    title="Syntrix Cloud Backend",
    lifespan=lifespan
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:

    return {
        "status": "ok"
    }


# ---------------------------------------------------------------------------
# Sync Now
# ---------------------------------------------------------------------------

@app.post("/sync-now")
async def sync_now() -> dict[str, str]:

    """
    Wake the poll loop immediately.

    This avoids waiting up to POLL_INTERVAL_SECONDS.
    """

    _poll_now.set()

    return {
        "status": "triggered"
    }


# ---------------------------------------------------------------------------
# Inventory refresh
# ---------------------------------------------------------------------------

@app.post("/inventory/refresh")
async def inventory_refresh() -> dict[str, Any]:

    await asyncio.to_thread(
        rebuild_hosts_ini
    )

    return {
        "status": "ok"
    }


# ---------------------------------------------------------------------------
# Inventory preview
# ---------------------------------------------------------------------------

@app.get("/inventory")
async def inventory_preview() -> dict[str, str]:

    path = os.path.join(
        AUTOMATION_ROOT,
        "inventory",
        "hosts.ini"
    )

    try:

        with open(path) as fh:
            return {
                "path": path,
                "content": fh.read()
            }

    except FileNotFoundError:

        raise HTTPException(
            status_code=404,
            detail=(
                "Inventory not generated yet "
                "— run one job first"
            )
        )


# ---------------------------------------------------------------------------
# Run pending job immediately
# ---------------------------------------------------------------------------

@app.post("/jobs/{job_id}/run-now")
async def run_now(
    job_id: str
) -> dict[str, str]:

    result = (
        supabase
        .table("jobs")
        .select("*")
        .eq("id", job_id)
        .single()
        .execute()
    )

    job = result.data

    if not job:

        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    if job["status"] != "pending":

        raise HTTPException(
            status_code=409,
            detail=(
                f"Job status is "
                f"'{job['status']}', "
                f"not 'pending'"
            )
        )

    asyncio.create_task(
        run_job(job)
    )

    return {
        "status": "triggered"
    }