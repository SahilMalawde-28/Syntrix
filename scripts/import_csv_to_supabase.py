"""
One-time migration: hosts_inventory.csv -> Supabase `devices` table.

Run this ONCE to move your existing machines into the database, then delete
the CSV. After this, devices are managed in the web UI and hosts.ini is
generated automatically by inventory_builder.py.

    python3 scripts/import_csv_to_supabase.py ../hosts_inventory.csv --lab lab_1

The CSV column names vary between setups, so this tries several common
spellings for each field and tells you what it found instead of guessing
silently. Use --dry-run first to check the mapping before writing anything.
"""

import argparse
import csv
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Candidate column names, in priority order.
FIELD_ALIASES = {
    "hostname": ["hostname", "host", "name", "host_name", "inventory_hostname"],
    "ip_address": ["ip_address", "ip", "address", "ansible_host"],
    "os_type": ["os_type", "os", "platform", "type"],
    "lab_id": ["lab_id", "lab", "group", "lab_name"],
    "ansible_user": ["ansible_user", "user", "username", "ssh_user"],
}


def pick(row: dict, field: str):
    for alias in FIELD_ALIASES[field]:
        for key in row:
            if key and key.strip().lower() == alias:
                value = (row[key] or "").strip()
                if value:
                    return value
    return None


def normalize_os(value: str | None) -> str:
    if not value:
        return "linux"
    v = value.strip().lower()
    return "windows" if v.startswith("win") else "linux"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--lab", help="lab_id to use when the CSV has no lab column")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(args.csv_path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    if not rows:
        print("CSV is empty.")
        return 1

    print(f"Detected columns: {list(rows[0].keys())}\n")

    devices, skipped = [], []
    for i, row in enumerate(rows, start=2):  # line 1 is the header
        hostname = pick(row, "hostname")
        ip = pick(row, "ip_address")
        lab = pick(row, "lab_id") or args.lab

        if not hostname or not ip:
            skipped.append((i, "missing hostname or ip", row))
            continue
        if not lab:
            skipped.append((i, "no lab_id (pass --lab)", row))
            continue

        device = {
            "hostname": hostname,
            "ip_address": ip,
            "os_type": normalize_os(pick(row, "os_type")),
            "lab_id": lab,
        }
        user = pick(row, "ansible_user")
        if user:
            device["ansible_user"] = user
        devices.append(device)

    for d in devices:
        print(f"  {d['hostname']:<20} {d['ip_address']:<16} {d['os_type']:<8} {d['lab_id']}")

    if skipped:
        print(f"\nSkipped {len(skipped)} row(s):")
        for line_no, reason, _ in skipped:
            print(f"  line {line_no}: {reason}")

    if args.dry_run:
        print(f"\nDry run — nothing written. Would insert {len(devices)} device(s).")
        return 0

    if not devices:
        print("\nNothing to insert.")
        return 1

    supabase = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )
    # Upsert on ip_address so re-running doesn't create duplicates.
    supabase.table("devices").upsert(devices, on_conflict="ip_address").execute()
    print(f"\nImported {len(devices)} device(s). You can now delete the CSV.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
