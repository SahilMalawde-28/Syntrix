"""
utils/csv_store.py — DEVICE REGISTRY, now backed by Supabase.

Despite the filename (kept so controllers/*.py need ZERO changes — every
function signature and return shape below is identical to the old
CSV-backed version), this module no longer reads or writes
hosts_inventory.csv. The `devices` table in Supabase is the single source
of truth. This is what makes that actually true, instead of just true in
the web UI while main.py quietly used the CSV underneath.

Telemetry event logging (log_telemetry_event / read_recent_telemetry) is
UNCHANGED and still uses telemetry_log.csv — that's a simple activity
history for the dashboard chart, not part of "the inventory", and moving
it wasn't asked for. Only the host-registry functions below were rewired.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
When main.py runs as a subprocess of backend/server.py, it inherits these
automatically (server.py loads them via python-dotenv into its own
process env, and subprocess.run() without an explicit `env=` argument
inherits the full parent environment).
"""

import csv
import os
import re
import socket
import subprocess
import platform
from collections import defaultdict
from datetime import datetime
from functools import lru_cache

CSV_TELEMETRY_PATH = "telemetry_log.csv"
INI_HOSTS_PATH = "inventory/hosts.ini"

# Credentials come from the environment (backend/.env — never committed to
# git), not from literals in this source file. A hardcoded password string
# in a .py file is worse than one in a gitignored .env: source code is the
# thing you're most likely to accidentally commit/share/paste somewhere.
#
# SSH to Linux hosts is now KEY-based (passwordless) — see
# SSH_PRIVATE_KEY_PATH. There is no SSH password to store at all for Linux.
#
# `become` (sudo) still needs a password — sudo has no passwordless mode
# here by design (NOPASSWD sudoers rules are themselves a bigger security
# trade-off many admins avoid) — so ANSIBLE_BECOME_PASSWORD is the one
# secret Linux still needs. Windows still authenticates with a real
# password over WinRM (no passwordless-WinRM equivalent set up here).
SSH_PRIVATE_KEY_PATH = os.environ.get(
    "ANSIBLE_SSH_PRIVATE_KEY_PATH", "/app/inventory/keys/id_ed25519_lab"
)
LINUX_BECOME_PASSWORD = os.environ.get("ANSIBLE_BECOME_PASSWORD", "")
WINDOWS_PASSWORD = os.environ.get("ANSIBLE_WINDOWS_PASSWORD", "")


@lru_cache(maxsize=1)
def _client():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


# ── 1. Telemetry Log Handler — UNCHANGED, still CSV ────────────────────────

def log_telemetry_event(primitive, target, status):
    file_exists = os.path.exists(CSV_TELEMETRY_PATH)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(CSV_TELEMETRY_PATH, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "primitive", "target", "status"])

        primitive_str = primitive if primitive else "unknown_primitive"
        target_str = target if target else "all"
        status_str = status if status else "error"

        writer.writerow([timestamp, primitive_str, target_str, status_str])


def read_recent_telemetry(limit=15):
    if not os.path.exists(CSV_TELEMETRY_PATH):
        return []

    records = []
    with open(CSV_TELEMETRY_PATH, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("timestamp"):
                records.append({
                    "timestamp": row.get("timestamp", "").strip(),
                    "primitive": row.get("primitive", "").strip(),
                    "target": row.get("target", "").strip(),
                    "status": row.get("status", "").strip()
                })

    return records[-limit:]


# ── 2. Hosts Inventory Handler — NOW SUPABASE-BACKED ───────────────────────

def _row_to_host_dict(row: dict) -> dict:
    """Supabase `devices` row -> the exact dict shape callers already expect."""
    groups = row.get("groups") or []
    group_str = ";".join(groups) if groups else ""
    return {
        "hostname": row["hostname"],
        "mac_address": row.get("mac_address") or "UNKNOWN",
        "ip": row.get("ip_address", "0.0.0.0"),
        "status": "online" if row.get("is_online") else "off",
        "os": "Windows" if row.get("os_type") == "windows" else "Linux",
        "group": group_str,
        "groups": groups,
    }


def read_stored_hosts():
    result = _client().table("devices").select("*").execute()
    return [_row_to_host_dict(r) for r in (result.data or [])]


def upsert_host(hostname, mac_address, current_ip, status, os_name="Linux", group=None):
    if isinstance(group, list):
        groups = [g for g in group if g]
    elif isinstance(group, str) and group:
        groups = [g.strip() for g in re.split(r"[;,]", group) if g.strip()]
    else:
        groups = None  # None -> don't touch existing groups on update

    row = {
        "hostname": hostname,
        "ip_address": current_ip,
        "os_type": "windows" if os_name.lower() == "windows" else "linux",
        "is_online": str(status).lower() in ("online", "ok", "success"),
    }
    if mac_address and mac_address != "UNKNOWN":
        row["mac_address"] = mac_address
    if groups is not None:
        row["groups"] = groups
    elif groups is None:
        # New host, no group given -> same default the old CSV version used.
        existing = _client().table("devices").select("hostname").eq("hostname", hostname).execute()
        if not existing.data:
            row["groups"] = ["windows_hosts" if row["os_type"] == "windows" else "linux_hosts"]

    _client().table("devices").upsert(row, on_conflict="hostname").execute()
    rebuild_hosts_ini()


# ── 3. Dynamic INI Rebuilder — reads Supabase instead of the CSV ──────────

def rebuild_hosts_ini():
    hosts = read_stored_hosts()
    if not hosts:
        return

    groups = defaultdict(list)
    for h in hosts:
        if h["status"].lower() == "off":
            continue
        for g in h["groups"]:
            groups[g].append(h)

    ini_lines = []
    for group_name, group_hosts in groups.items():
        ini_lines.append(f"[{group_name}]")
        seen = set()
        for h in group_hosts:
            hostname = h["hostname"]
            if hostname in seen:
                continue
            seen.add(hostname)
            ip = h["ip"]
            if hostname == "wsl_local" or ip in ("127.0.0.1", "localhost", "wsl_local"):
                ini_lines.append(f"{hostname} ansible_host=localhost ansible_connection=local")
            else:
                ini_lines.append(f"{hostname} ansible_host={ip}")
        ini_lines.append("")

    if any("linux" in g.lower() for g in groups):
        ini_lines.append(
            "[linux_hosts:vars]\n"
            "ansible_user=ansible_user\n"
            f"ansible_ssh_private_key_file={SSH_PRIVATE_KEY_PATH}\n"
            "ansible_become=true\n"
            "ansible_become_method=sudo\n"
            f"ansible_become_pass={LINUX_BECOME_PASSWORD}\n"
        )
        if not LINUX_BECOME_PASSWORD:
            import sys
            print(
                "WARNING: ANSIBLE_BECOME_PASSWORD is not set — sudo/become "
                "tasks on Linux hosts will fail until it's set in .env",
                file=sys.stderr,
            )

    if any("win" in g.lower() for g in groups):
        ini_lines.append(
            "[windows_hosts:vars]\n"
            "ansible_user=ansible_user\n"
            f"ansible_password={WINDOWS_PASSWORD}\n"
            "ansible_connection=winrm\n"
            "ansible_port=5985\n"
            "ansible_winrm_scheme=http\n"
            "ansible_winrm_server_cert_validation=ignore\n"
            "ansible_winrm_transport=ntlm\n"
        )

    os.makedirs(os.path.dirname(INI_HOSTS_PATH), exist_ok=True)
    with open(INI_HOSTS_PATH, mode="w", encoding="utf-8") as f:
        f.write("\n".join(ini_lines).strip() + "\n")


# ── 4. Network Discovery & Reachability Engine — UNCHANGED logic, ─────────
#      writes results to Supabase instead of the CSV.

def check_tcp_port(ip, port, timeout=1):
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def ping_host(ip_address, os_type="Linux"):
    clean_ip = str(ip_address).strip()
    if clean_ip in ("127.0.0.1", "localhost", "wsl_local", "win_local"):
        return True

    if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", clean_ip):
        return False

    is_win = platform.system().lower() == "windows"
    param = "-n" if is_win else "-c"
    timeout_param = "-w" if is_win else "-W"
    timeout_val = "1000" if is_win else "1"

    cmd = ["ping", param, "1", timeout_param, timeout_val, clean_ip]
    try:
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0:
            return True
    except Exception:
        pass

    target_port = 5985 if os_type.lower() == "windows" else 22
    return check_tcp_port(clean_ip, target_port)


def sync_network_hosts():
    hosts = read_stored_hosts()
    if not hosts:
        return hosts

    for h in hosts:
        clean_ip = str(h["ip"]).strip()
        clean_hostname = str(h["hostname"]).strip()

        if clean_hostname in ("wsl_local", "win_local") or clean_ip in (
            "127.0.0.1", "localhost", "wsl_local", "win_local",
        ):
            new_status = "online"
        else:
            new_status = "online" if ping_host(clean_ip, os_type=h.get("os", "Linux")) else "off"

        if h["status"] != new_status:
            _client().table("devices").update(
                {"is_online": new_status == "online"}
            ).eq("hostname", clean_hostname).execute()
            h["status"] = new_status

    rebuild_hosts_ini()
    return hosts


if __name__ == "__main__":
    sync_network_hosts()
