import csv
import os
import subprocess
import platform
import re
import socket
from datetime import datetime
from collections import defaultdict

CSV_TELEMETRY_PATH = "telemetry_log.csv"
CSV_HOSTS_PATH = "hosts_inventory.csv"
INI_HOSTS_PATH = "inventory/hosts.ini"

# ── 1. Telemetry Log Handler ───────────────────────────────────────────────

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

# ── 2. Hosts Inventory Handler ────────────────────────────────────────────

def read_stored_hosts():
    """
    Reads hosts and keeps the exact raw group string without modifying or reformatting.
    """
    if not os.path.exists(CSV_HOSTS_PATH):
        return []

    hosts_list = []
    with open(CSV_HOSTS_PATH, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            hostname = row.get("hostname", "").strip()
            if not hostname:
                continue

            mac = row.get("mac_address", "UNKNOWN").strip()
            ip = row.get("ip", "0.0.0.0").strip()
            status = row.get("status", "off").strip().lower()
            os_type = row.get("os", "Linux").strip()
            raw_group = row.get("group", "").strip()

            # Split strictly for INI building only without modifying raw_group
            groups_for_ini = [g.strip() for g in re.split(r'[;,]', raw_group) if g.strip()]

            hosts_list.append({
                "hostname": hostname,
                "mac_address": mac,
                "ip": ip,
                "status": status,
                "os": os_type,
                "group": raw_group,
                "groups": groups_for_ini
            })

    return hosts_list

def upsert_host(hostname, mac_address, current_ip, status, os_name="Linux", group=None):
    hosts = read_stored_hosts()
    updated = False

    group_str = group if isinstance(group, str) else (";".join(group) if isinstance(group, list) else "")

    for h in hosts:
        if h["hostname"] == hostname:
            h["mac_address"] = mac_address if mac_address != "UNKNOWN" else h["mac_address"]
            h["ip"] = current_ip
            h["status"] = status
            h["os"] = os_name
            if group_str:
                h["group"] = group_str
            updated = True
            break

    if not updated:
        hosts.append({
            "hostname": hostname,
            "mac_address": mac_address,
            "ip": current_ip,
            "status": status,
            "os": os_name,
            "group": group_str or ("windows_hosts" if os_name.lower() == "windows" else "linux_hosts"),
            "groups": [group_str] if group_str else []
        })

    with open(CSV_HOSTS_PATH, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["hostname", "mac_address", "ip", "status", "os", "group"])
        writer.writeheader()
        for h in hosts:
            writer.writerow({
                "hostname": h["hostname"],
                "mac_address": h["mac_address"],
                "ip": h["ip"],
                "status": h["status"],
                "os": h["os"],
                "group": h["group"]
            })

    rebuild_hosts_ini()

# ── 3. Dynamic INI Rebuilder ──────────────────────────────────────────────

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
        seen_hosts_in_group = set()
        for h in group_hosts:
            hostname = h["hostname"]
            if hostname in seen_hosts_in_group:
                continue
            seen_hosts_in_group.add(hostname)
            ip = h["ip"]

            if hostname in ("wsl_local") or ip in ("127.0.0.1", "localhost", "wsl_local"):
                ini_lines.append(f"{hostname} ansible_host=localhost ansible_connection=local")
            else:
                ini_lines.append(f"{hostname} ansible_host={ip}")
        ini_lines.append("")

    if "linux_hosts" in groups or any("linux" in g.lower() for g in groups):
        ini_lines.append("""[linux_hosts:vars]
ansible_user=ansible_user
ansible_password=Pass@123
ansible_become_password=Pass@123
ansible_become_pass=Pass@123
""")

    if "windows_hosts" in groups or any("win" in g.lower() for g in groups):
        ini_lines.append("""[windows_hosts:vars]
ansible_user=ansible_user
ansible_password=Pass@123
ansible_connection=winrm
ansible_port=5985
ansible_winrm_scheme=http
ansible_winrm_server_cert_validation=ignore
ansible_winrm_transport=ntlm
""")

    os.makedirs(os.path.dirname(INI_HOSTS_PATH), exist_ok=True)
    with open(INI_HOSTS_PATH, mode="w", encoding="utf-8") as f:
        f.write("\n".join(ini_lines).strip() + "\n")

# ── 4. Network Discovery & Reachability Engine ──────────────────────────

def check_tcp_port(ip, port, timeout=1):
    """Fallback TCP check for when ICMP/Ping is blocked by firewall."""
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def ping_host(ip_address, os_type="Linux"):
    """
    1. Check loopbacks / placeholder local names.
    2. Try ICMP Ping.
    3. Fallback to WinRM (5985) or SSH (22).
    """
    clean_ip = str(ip_address).strip()
    if clean_ip in ("127.0.0.1", "localhost", "wsl_local", "win_local"):
        return True

    if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', clean_ip):
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
    """
    Checks reachability without modifying IP addresses, group strings, or OS.
    ONLY updates status ('online' / 'off') in hosts_inventory.csv.
    """
    hosts = read_stored_hosts()
    if not hosts:
        return hosts

    changed = False

    for h in hosts:
        clean_ip = str(h["ip"]).strip()
        clean_hostname = str(h["hostname"]).strip()

        # Keep local loopback test devices online
        if clean_hostname in ("wsl_local", "win_local") or clean_ip in ("127.0.0.1", "localhost", "wsl_local", "win_local"):
            if h["status"] != "online":
                h["status"] = "online"
                changed = True
            continue

        # Evaluate live status
        is_alive = ping_host(clean_ip, os_type=h.get("os", "Linux"))
        new_status = "online" if is_alive else "off"

        if h["status"] != new_status:
            h["status"] = new_status
            changed = True

    # Rewrite CSV ONLY if a status flipped
    if changed:
        with open(CSV_HOSTS_PATH, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["hostname", "mac_address", "ip", "status", "os", "group"])
            writer.writeheader()
            for h in hosts:
                writer.writerow({
                    "hostname": h["hostname"],
                    "mac_address": h["mac_address"],
                    "ip": h["ip"],
                    "status": h["status"],
                    "os": h["os"],
                    "group": h["group"]
                })

    rebuild_hosts_ini()
    return hosts

if __name__ == "__main__":
    sync_network_hosts()