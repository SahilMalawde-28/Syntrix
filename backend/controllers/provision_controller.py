import json
import subprocess
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def run_provision_cli(args):
    playbook = BACKEND_DIR / "playbooks" / "provision_machine.yml"
    inventory = BACKEND_DIR / "inventory" / "hosts.ini"

    extra_vars = {
    "target_hosts": args.target,

    "provision_user": args.username,
    "provision_group": args.group,
    "provision_hostname": args.hostname,
    "provision_dns_server": args.dns_server,

    "provision_package_name": args.package_name,
    "provision_config_src": args.config_src,
    "provision_config_dest": args.config_dest,
    "provision_file_path": args.file_path,
    "provision_file_content": args.file_content,
    "provision_command": args.command,

    "safe_mode": args.safe_mode,
    "modify_file_flag": args.modify_file,
    "run_cmd": args.run_command,
}

    cmd = [
        "ansible-playbook",
        "-i", str(inventory),
        str(playbook),
        "--extra-vars", json.dumps(extra_vars),
    ]

    result = subprocess.run(
        cmd,
        cwd=BACKEND_DIR,
        text=True,
    )

    if result.returncode != 0:
        raise SystemExit(result.returncode)