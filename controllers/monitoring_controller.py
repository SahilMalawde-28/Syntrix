import sys
import json
import subprocess
import os
import warnings

warnings.filterwarnings("ignore", message=".*urllib3.*match a supported version.*")

def run_monitoring_primitive(primitive_name, target="all", extra_vars=None):
    """Executes an Ansible playbook primitive and returns structured output."""
    target = target if target else "all"

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

# --- Domain Functions (Granular Vitals & Process Management) ---

def check_system_vitals(target="all"):
    """Monitor detailed disk space and memory across targets."""
    res_disk = run_monitoring_primitive("check_disk", target=target)
    res_mem = run_monitoring_primitive("check_memory", target=target)
    
    return {
        "success": res_disk["success"] and res_mem["success"],
        "disk": res_disk["stdout"],
        "memory": res_mem["stdout"],
        "stderr": f"{res_disk['stderr']}\n{res_mem['stderr']}".strip()
    }

def perform_health_check(target="all"):
    """Run a thorough connectivity and service health check."""
    return run_monitoring_primitive("health_check", target=target)

def monitor_processes(target="all"):
    """Identify high CPU/memory consuming active processes."""
    return run_monitoring_primitive("process_monitor", target=target)

def kill_heavy_processes(process_name, target="all"):
    """Terminate unauthorized or heavy processes using extra-vars."""
    if not process_name:
        return {"success": False, "stderr": "Error: No process name provided to kill."}
        
    var_string = f"target_process={process_name}"
    return run_monitoring_primitive("process_monitor", target=target, extra_vars=var_string)

# --- CLI Command Router for Monitoring Domain ---

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