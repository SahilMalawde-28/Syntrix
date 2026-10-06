import sys
import json
import subprocess
import os
import re
import warnings

warnings.filterwarnings("ignore", message=".*urllib3.*match a supported version.*")

def parse_memory_output(raw_stdout):
    """Parses free -m output per host into a dictionary."""
    hosts_memory = {}
    current_host = None

    for line in raw_stdout.splitlines():
        # Match Ansible task output or recap headers, e.g., "ok: [wsl_local]" or "wsl_local | SUCCESS"
        host_match = re.search(r'(?:ok|changed|failed):\s*\[([^\]]+)\]', line)
        if host_match:
            current_host = host_match.group(1)

        # Match memory stats row: Mem: total used free ...
        mem_match = re.search(r'Mem:\s+(\d+)\s+(\d+)\s+(\d+)', line)
        if mem_match and current_host:
            total = int(mem_match.group(1))
            used = int(mem_match.group(2))
            free = int(mem_match.group(3))
            used_pct = round((used / total) * 100, 1) if total > 0 else 0
            
            hosts_memory[current_host] = {
                "total_mb": total,
                "used_mb": used,
                "free_mb": free,
                "used_pct": used_pct
            }
            
    return hosts_memory

def parse_disk_output(raw_stdout):
    """Parses df -h output per host into a dictionary."""
    hosts_disk = {}
    current_host = None

    for line in raw_stdout.splitlines():
        host_match = re.search(r'(?:ok|changed|failed):\s*\[([^\]]+)\]', line)
        if host_match:
            current_host = host_match.group(1)

        # Match filesystem disk lines (Size, Used, Avail, Use%)
        disk_match = re.search(r'(\d+[G|M|K|T]?)\s+(\d+[G|M|K|T]?)\s+(\d+[G|M|K|T]?)\s+(\d+)%\s+(/.*|[A-Za-z]:.*)?$', line.strip())
        if disk_match and current_host:
            hosts_disk[current_host] = {
                "size": disk_match.group(1),
                "used": disk_match.group(2),
                "avail": disk_match.group(3),
                "used_pct": int(disk_match.group(4))
            }

    return hosts_disk

def run_monitoring_primitive(primitive_name, target="all", extra_vars=None):
    """Executes an Ansible playbook primitive with clean environment flags."""
    target = target if target else "all"

    command = [
        "ansible-playbook",
        "-i", "inventory/hosts.ini",
        f"primitives/{primitive_name}.yml",
        "--limit", target
    ]

    if extra_vars:
        command.extend(["--extra-vars", extra_vars])

    env = os.environ.copy()
    env["ANSIBLE_CONFIG"] = "/dev/null" if not os.path.exists("ansible.cfg") else "ansible.cfg"
    env["ANSIBLE_SKIP_CONFLICTING_DIRECTORY_WARNINGS"] = "1"
    env["ANSIBLE_ACTION_WARNINGS"] = "False"
    env["ANSIBLE_LOCALHOST_WARNING"] = "False"
    env["ANSIBLE_PYTHON_INTERPRETER"] = "auto_silent"
    env["PYTHONWARNINGS"] = "ignore"

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            env=env
        )

        clean_stderr_lines = [
            line for line in result.stderr.splitlines()
            if not any(w in line for w in ["[WARNING]", "world-writable", "ansible.cfg", "interpreter_discovery"])
        ]

        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": "\n".join(clean_stderr_lines).strip()
        }
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e)}

def check_system_vitals(target="all"):
    """Monitor detailed disk space and memory across all specified targets."""
    res_disk = run_monitoring_primitive("check_disk", target=target)
    res_mem = run_monitoring_primitive("check_memory", target=target)

    return {
        "success": res_disk["success"] and res_mem["success"],
        "disk": parse_disk_output(res_disk["stdout"]),
        "memory": parse_memory_output(res_mem["stdout"]),
        "stderr": f"{res_disk['stderr']}\n{res_mem['stderr']}".strip()
    }

def perform_health_check(target="all"):
    return run_monitoring_primitive("health_check", target=target)

def monitor_processes(target="all"):
    return run_monitoring_primitive("process_monitor", target=target)

def kill_heavy_processes(process_name, target="all"):
    if not process_name:
        return {"success": False, "stderr": "Error: No process name provided to kill."}
    var_string = f"target_process={process_name}"
    return run_monitoring_primitive("process_monitor", target=target, extra_vars=var_string)

def run_monitoring_cli(args):
    action = args.action
    target = getattr(args, "target", "all")
    process_name = getattr(args, "process_name", None)

    response = {"success": False, "stdout": "", "stderr": "Invalid action"}

    if action == "vitals":
        response = check_system_vitals(target=target)
    elif action == "health":
        response = perform_health_check(target=target)
    elif action == "processes":
        response = monitor_processes(target=target)
    elif action == "kill-process":
        response = kill_heavy_processes(process_name, target=target)

    print(json.dumps(response))
    sys.exit(0 if response["success"] else 1)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Monitoring Domain Controller")
    parser.add_argument("action", choices=["vitals", "health", "processes", "kill-process"])
    parser.add_argument("--target", default="all")
    parser.add_argument("--process-name", dest="process_name")

    args = parser.parse_args()
    run_monitoring_cli(args)