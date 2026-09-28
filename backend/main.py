import argparse
import sys

def main():
    parser = argparse.ArgumentParser(prog="automation_platform")
    sub = parser.add_subparsers(dest="domain")

    # ── User Domain Router ──────────────────────────────────────────────────
    user_p = sub.add_parser("user")
    user_p.add_argument("action", choices=[
        "create", "delete", "add-group", "remove-group",
        "grant-admin", "revoke-admin", "grant-command",
        "lock", "unlock", "set-password", "list"
    ])
    user_p.add_argument("--target", default="all")
    user_p.add_argument("--username")
    user_p.add_argument("--group")
    user_p.add_argument("--command")
    user_p.add_argument("--password")
    user_p.add_argument("--password-hash", dest="password_hash")

    # ── Telemetry & Monitoring Domain Router ───────────────────────────────
    telemetry_p = sub.add_parser("telemetry")
    telemetry_p.add_argument("action", choices=["get-stats", "kill-process"])
    telemetry_p.add_argument("--target", default="all")
    telemetry_p.add_argument("--process-name", dest="process_name")
    # ── Detailed Monitoring Domain Router ──────────────────────────────────
    monitor_p = sub.add_parser("monitor")
    monitor_p.add_argument("action", choices=["vitals", "health", "processes", "kill-process"])
    monitor_p.add_argument("--target", default="all")
    monitor_p.add_argument("--process-name", dest="process_name")

    args = parser.parse_args()

    if args.domain == "user":
        from controllers.user_controller import run_user_cli
        run_user_cli(args)
    elif args.domain == "telemetry":
        from controllers.telemetry_controller import run_telemetry_cli
        run_telemetry_cli(args)
    elif args.domain == "monitor":
        from controllers.monitoring_controller import run_monitoring_cli
        run_monitoring_cli(args)

if __name__ == "__main__":
    main()