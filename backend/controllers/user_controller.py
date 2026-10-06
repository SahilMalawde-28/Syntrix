import argparse
import subprocess
import json
import sys
import platform
import os
import re

from utils.csv_store import log_telemetry_event

def parse_ansible_stdout(stdout, stderr):
    """
    Parses standard Ansible output into structured per-host data.
    Ensures user arrays correspond strictly to their respective host.
    """
    hosts_summary = {}
    if not stdout:
        return hosts_summary

    lines = stdout.splitlines()

    # 1. Parse RECAP section to classify host connectivity status
    recap_started = False
    for line in lines:
        if "PLAY RECAP" in line:
            recap_started = True
            continue
        if recap_started and ":" in line:
            parts = line.split(":", 1)
            host_name = parts[0].strip()
            stats = parts[1].strip()

            is_unreachable = "unreachable=1" in stats or ("unreachable=" in stats and not "unreachable=0" in stats)
            is_failed = "failed=1" in stats or ("failed=" in stats and not "failed=0" in stats)

            hosts_summary[host_name] = {
                "status": "unreachable" if is_unreachable else ("failed" if is_failed else "online"),
                "users": [],
                "stats": stats
            }

    # 2. Extract per-host user array outputted by debug tasks (e.g. Display Linux/Windows Users)
    # Matches patterns like: ok: [lin_1] => {\n    "msg": [\n        "user1", ...
    pattern = r'(?:ok|changed):\s*\[([^\]]+)\]\s*=>\s*\{[^}]*?"msg":\s*(\[\s*[\s\S]*?\])'
    matches = re.findall(pattern, stdout)

    for host_name, msg_str in matches:
        if host_name in hosts_summary:
            try:
                user_list = json.loads(msg_str)
                if isinstance(user_list, list):
                    hosts_summary[host_name]["users"] = user_list
            except Exception:
                continue

    return hosts_summary

def run_playbook(playbook, extra_vars_dict, target):
    extra_vars_json = json.dumps(extra_vars_dict) if extra_vars_dict else ""
    cwd = os.getcwd().replace("\\", "/").replace("C:", "/mnt/c")

    if platform.system() == "Windows":
        ansible_cmd = f"cd '{cwd}' && ANSIBLE_CONFIG_WARNING=False ansible-playbook {playbook} -i inventory/hosts.ini -l {target}"
        if extra_vars_json:
            safe_vars = extra_vars_json.replace('"', '\\"')
            ansible_cmd += f' -e "{safe_vars}"'
            
        cmd = ["wsl", "bash", "-c", ansible_cmd]
    else:
        cmd = [
            "ansible-playbook",
            playbook,
            "-i", "inventory/hosts.ini",
            "-l", target
        ]
        if extra_vars_json:
            cmd.extend(["-e", extra_vars_json])

    try:
        res = subprocess.run(cmd, capture_output=True, text=True)
        hosts_data = parse_ansible_stdout(res.stdout, res.stderr)
        status_str = "success" if res.returncode == 0 else "error"

        response = {
            "status": status_str,
            "return_code": res.returncode,
            "hosts": hosts_data,
            "stdout": res.stdout,
            "stderr": res.stderr
        }
    except FileNotFoundError:
        error_msg = "WSL is not installed or available on PATH." if platform.system() == "Windows" else "ansible-playbook binary not found."
        response = {
            "status": "error",
            "return_code": 1,
            "hosts": {},
            "stdout": "",
            "stderr": f"Execution Failed: {error_msg}"
        }
    except Exception as e:
        response = {
            "status": "error",
            "return_code": 1,
            "hosts": {},
            "stdout": "",
            "stderr": f"Unexpected error: {str(e)}"
        }

    primitive_name = os.path.basename(playbook)
    telemetry_status = "ok" if response["status"] == "success" else "error"
    try:
        log_telemetry_event(primitive_name, target, telemetry_status)
    except Exception as log_err:
        sys.stderr.write(f"Failed to log telemetry event: {str(log_err)}\n")

    print(json.dumps(response, indent=2))

def run_user_cli(args):
    target = getattr(args, "target", "all")
    extra_vars = {}

    if args.action == "create":
        extra_vars = {"user": args.username}
        playbook = "primitives/create_user.yml"

    elif args.action == "delete":
        extra_vars = {"user": args.username}
        playbook = "primitives/delete_user.yml"

    elif args.action == "add-group":
        extra_vars = {"user": args.username, "group": args.group}
        playbook = "primitives/add_to_group.yml"

    elif args.action == "remove-group":
        extra_vars = {"user": args.username, "group": args.group}
        playbook = "primitives/remove_from_group.yml"

    elif args.action == "grant-admin":
        extra_vars = {"user": args.username}
        playbook = "primitives/grant_sudo.yml"

    elif args.action == "revoke-admin":
        extra_vars = {"user": args.username}
        playbook = "primitives/revoke_sudo.yml"

    elif args.action == "grant-command":
        extra_vars = {"user": args.username, "command": args.command}
        playbook = "primitives/grant_command.yml"
        target = "linux_hosts"

    elif args.action == "lock":
        extra_vars = {"user": args.username}
        playbook = "primitives/lock_user.yml"

    elif args.action == "unlock":
        extra_vars = {"user": args.username}
        playbook = "primitives/unlock_user.yml"

    elif args.action == "set-password":
        playbook = "primitives/set_password.yml"
        if args.password:
            extra_vars = {"user": args.username, "password": args.password}
        else:
            extra_vars = {"user": args.username, "password_hash": args.password_hash}

    elif args.action == "list":
        extra_vars = {}
        playbook = "primitives/list_users.yml"

    else:
        print(json.dumps({"status": "error", "message": f"Unknown action {args.action}"}))
        return

    run_playbook(playbook, extra_vars, target)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="User Controller")
    parser.add_argument("action", choices=[
        "create", "delete", "add-group", "remove-group",
        "grant-admin", "revoke-admin", "grant-command",
        "lock", "unlock", "set-password", "list"
    ])
    parser.add_argument("--target", default="all", help="Target host or group (e.g., linux_hosts, windows_hosts)")
    parser.add_argument("--username", help="Target username")
    parser.add_argument("--group", help="Target group name")
    parser.add_argument("--command", help="Command path (e.g., /usr/bin/systemctl)")
    parser.add_argument("--password", help="Plain text password (Windows)")
    parser.add_argument("--password-hash", help="Hashed password (Linux)")
    
    args = parser.parse_args()
    run_user_cli(args)