import sys
import json
import re
import os
import subprocess
import socket
import warnings
from datetime import datetime, timedelta

from utils.csv_store import (
    upsert_host,
    read_stored_hosts,
    log_telemetry_event,
    read_recent_telemetry,
    rebuild_hosts_ini
)

warnings.filterwarnings("ignore", message=".*urllib3.*match a supported version.*")

def resolve_dynamic_ip(hostname, fallback_ip):
    """
    Attempts to resolve current IP via DNS/mDNS if ping to previous IP fails.
    """
    try:
        resolved_ip = socket.gethostbyname(hostname)
        return resolved_ip
    except socket.gaierror:
        return fallback_ip

def run_monitoring_primitive(primitive_name, target="all", extra_vars=None):
    target = target if target else "all"

    # Ensure hosts.ini is updated and off devices are excluded before executing playbook
    rebuild_hosts_ini()

    command = [
        "ansible-playbook",
        "-i", "inventory/hosts.ini",
        f"primitives/{primitive_name}.yml",
        "--limit", target
    ]
    
    if extra_vars:
        command.extend(["--extra-vars", extra_vars])
    
    try:
        result = subprocess.run(command, capture_output=True, text=True, env=os.environ)
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e)}

def parse_and_sync_inventory(raw_output):
    """
    Parses Ansible stdout and syncs status changes directly into hosts_inventory.csv,
    then updates hosts.ini to exclude offline nodes.
    """
    nodes = []
    recap_pattern = re.compile(r'([\w\.\-]+)\s*:\s*ok=(\d+)\s*changed=(\d+)\s*unreachable=(\d+)\s*failed=(\d+)')
    
    stored_hosts = {h["hostname"]: h for h in read_stored_hosts()}

    for line in raw_output.splitlines():
        match = recap_pattern.search(line)
        if match:
            host, ok, changed, unreachable, failed = match.groups()
            is_off = int(unreachable) > 0
            is_failed = int(failed) > 0

            cached_host = stored_hosts.get(host, {})
            last_known_ip = cached_host.get("ip", host)
            mac_addr = cached_host.get("mac_address", "UNKNOWN")
            group_name = cached_host.get("group", "linux_hosts")

            current_ip = last_known_ip
            if is_off:
                resolved = resolve_dynamic_ip(host, last_known_ip)
                if resolved != last_known_ip:
                    current_ip = resolved
                    status = "online"
                else:
                    status = "off"
            else:
                status = "warn" if is_failed else "online"

            upsert_host(
                hostname=host,
                mac_address=mac_addr,
                current_ip=current_ip,
                status=status,
                os_name=cached_host.get("os", "Linux"),
                group=group_name
            )

            nodes.append({
                "name": host,
                "ip": current_ip,
                "os": cached_host.get("os", "Linux"),
                "status": status,
                "cpu": 0,
                "memory": 0,
                "disk": 0
            })

    # Include offline/unseen nodes in returned dashboard JSON state without executing against them
    for hostname, host_data in stored_hosts.items():
        if not any(n["name"] == hostname for n in nodes):
            nodes.append({
                "name": hostname,
                "ip": host_data.get("ip", "0.0.0.0"),
                "os": host_data.get("os", "Linux"),
                "status": host_data.get("status", "off"),
                "cpu": 0,
                "memory": 0,
                "disk": 0
            })

    # Sync hosts.ini structure with current active nodes
    rebuild_hosts_ini()

    return nodes

def get_real_chart_data():
    days_map = { (datetime.now() - timedelta(days=i)).strftime("%a"): {"success": 0, "failed": 0} for i in range(6, -1, -1) }
    records = read_recent_telemetry(limit=200)
    
    for r in records:
        try:
            dt = datetime.strptime(r["timestamp"], "%Y-%m-%d %H:%M:%S")
            day_name = dt.strftime("%a")
            if day_name in days_map:
                if r["status"] in ["ok", "success", "SUCCESS"]:
                    days_map[day_name]["success"] += 1
                else:
                    days_map[day_name]["failed"] += 1
        except (ValueError, KeyError):
            continue

    return [{"day": day, "success": data["success"], "failed": data["failed"]} for day, data in days_map.items()]

def run_telemetry_cli(args):
    action = args.action
    target = getattr(args, "target", "all")

    if action == "get-stats":
        health_res = run_monitoring_primitive("health_check", target=target)
        nodes = parse_and_sync_inventory(health_res["stdout"]) if health_res["stdout"] else []

        if not nodes:
            stored = read_stored_hosts()
            nodes = [
                {
                    "name": h["hostname"],
                    "ip": h["ip"],
                    "os": h.get("os", "Linux"),
                    "status": h["status"],
                    "cpu": 0, "memory": 0, "disk": 0
                } for h in stored
            ]

        log_telemetry_event("health_check.yml", target, "ok" if health_res["success"] else "error")
        history = read_recent_telemetry(15)

        payload = {
            "nodes": nodes,
            "activity": [
                {
                    "type": "ok" if h.get("status") in ["ok", "success", "SUCCESS"] else "err",
                    "title": f"Executed {h.get('primitive') or 'Playbook'}",
                    "host": h.get("target") or "all",
                    "meta": f"Target: {h.get('target') or 'all'}",
                    "time": h.get("timestamp", "Just now")
                }
                for h in reversed(history)
            ],
            "pendingTasks": [
                {"name": "health_check.yml", "host": target, "status": "ok" if health_res["success"] else "warn"},
                {"name": "check_disk.yml", "host": target, "status": "ok"},
                {"name": "process_monitor.yml", "host": target, "status": "ok"}
            ],
            "chartData": get_real_chart_data()
        }

        print(json.dumps(payload))
        sys.exit(0)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Telemetry Controller")
    parser.add_argument("action", choices=["get-stats"])
    parser.add_argument("--target", default="all")
    
    args = parser.parse_args()
    run_telemetry_cli(args)