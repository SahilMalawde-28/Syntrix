# Syntrix

A web console for managing lab PCs with Ansible. You sign in from a browser, pick what you want done (create a user, pull health stats, and so on) and the job runs on a server in the college network against the machines you targeted. Linux machines are reached over SSH, Windows machines over WinRM.

It started as an Electron desktop app that ran `main.py` on the admin's own laptop. That worked for one person on one machine, so it was split up: the UI is now a normal web app, and everything that touches the lab PCs runs in a Docker container on a server.

## How it fits together

```
Browser (React)  -->  Supabase (Postgres + Auth)  <--  Backend container (FastAPI + Ansible)  -->  Lab PCs
  queues jobs           stores devices and jobs         polls for pending jobs, runs main.py      SSH / WinRM
```

The browser never talks to a lab PC and never talks to the backend for normal work. It writes a row into the `jobs` table and watches that row. The backend picks the row up, runs `main.py` with the right arguments, and writes the output back. Supabase row-level security decides who can see and queue what: the HOD sees everything, a lab in-charge only sees their own lab.

## Repository layout

```
Syntrix/
├── Frontend/          Vite + React app
├── backend/           everything that runs on the server
│   ├── server.py      FastAPI app: polls jobs, dispatches per device
│   ├── main.py        CLI entry point for the Ansible domains
│   ├── controllers/   one controller per domain (user, telemetry, monitor)
│   ├── primitives/    small single-purpose playbooks
│   ├── playbooks/     larger playbooks built from the primitives
│   ├── utils/         csv_store.py (device registry, see notes) and helpers
│   ├── inventory/     hosts.ini lives here, generated, do not edit
│   ├── ansible.cfg
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env           your secrets, not committed
├── database/
│   ├── schema.sql
│   └── migrations/    002, 003, 004, run in order after schema.sql
└── scripts/
    └── import_csv_to_supabase.py    one-off, for moving an old hosts_inventory.csv
```

## What you need

- A Supabase project (the free tier is enough)
- Docker Desktop on Windows, or Docker Engine on the server
- Node 18 or newer for the frontend
- Network access from the machine running Docker to the lab PCs

Ansible cannot run as a control node on native Windows, which is a limitation of Ansible itself. That is the main reason the backend runs in a Linux container. Do not try to run `main.py` under Windows Python and expect Ansible to work.

## Setup

### 1. Database

Open the Supabase SQL editor and run these one at a time, in this order:

```
database/schema.sql
database/migrations/002_inventory_columns.sql
database/migrations/003_inventory_registry_columns.sql
database/migrations/004_job_host_status.sql
```

Then, under Authentication, create your first user. A profile row is created for them automatically with the role `lab_incharge`. Open the `profiles` table and change your own role to `hod`. For a lab in-charge, set `assigned_lab` to something like `lab_1`.

While developing you may want to turn off "Confirm email" in the Auth settings so test users work straight away.

### 2. Backend

```
cd backend
cp .env.example .env
```

Fill in `.env` (all the variables are listed below), then:

```
docker compose up -d --build
docker compose logs -f
curl http://localhost:8000/health
```

You should see log lines about polling the jobs table and a `{"status":"ok"}` from the health check. If the container keeps restarting, `docker compose logs --tail=50` will say why.

### 3. Reaching the lab PCs

Nothing is connected when you add a device. The connection is made by Ansible at the moment a job runs, using whatever `hosts.ini` says for that machine.

**Linux (SSH with a key, no password).** Generate a key inside the container so it lands in the mounted `inventory/keys` folder:

```
docker exec -it syntrix-backend bash
mkdir -p inventory/keys
ssh-keygen -t ed25519 -f inventory/keys/id_ed25519_lab -N "" -C syntrix-backend
ssh-copy-id -i inventory/keys/id_ed25519_lab.pub someuser@192.168.1.50
```

`ssh-copy-id` asks for that account's password once. After that the key is enough. The account needs sudo rights, and its sudo password goes in `ANSIBLE_BECOME_PASSWORD`, because sudo is the one thing that still needs a password.

If the machine's account is not called `ansible_user`, put the real name in the device's `ansible_user` column and it will override the default for that host only.

**Windows (WinRM).** On each Windows PC, in an administrator PowerShell:

```
winrm quickconfig -y
Set-Item WSMan:\localhost\Service\AllowUnencrypted -Value $true
Set-Item WSMan:\localhost\Service\Auth\Basic -Value $true
New-NetFirewallRule -Name "WinRM-HTTP" -DisplayName "WinRM HTTP" -Enabled True -Direction Inbound -Protocol TCP -LocalPort 5985 -Action Allow
```

The account Ansible logs in as needs to exist there, with the password you set in `ANSIBLE_WINDOWS_PASSWORD`. This sets up plain HTTP WinRM on port 5985, which is fine on a closed lab network and worth revisiting before anything wider.

### 4. Register devices

Add a row per machine in the `devices` table, either in the Table Editor or with SQL:

```sql
INSERT INTO devices (hostname, ip_address, os_type, groups, is_online, lab_id)
VALUES ('lab1-pc01', '192.168.1.50', 'linux', ARRAY['linux_hosts'], true, 'lab_1');
```

`groups` matters: a device with an empty `groups` array is left out of `hosts.ini` and Ansible will report that no hosts matched. The two group names the playbooks rely on are `linux_hosts` and `windows_hosts`.

### 5. Frontend

```
cd Frontend
npm install
```

Create `Frontend/.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Use the anon key here and never the service role key, since everything in the frontend ends up in the browser. Then `npm run dev` and open http://localhost:3000. You need to sign in, because with no session the row-level security policies return nothing at all.

## How a job runs

1. The UI inserts a row into `jobs` with a domain, an action, a target and any extra parameters, and the row starts as `pending`.
2. The backend finds it. It checks for pending jobs every `POLL_INTERVAL_SECONDS` (default five minutes), and immediately if something calls `POST /sync-now`.
3. The target (a group, a lab, a single hostname, or `all`) is expanded into individual devices.
4. Each device is pinged first. If it does not answer, it is marked offline and that one device is queued for later. The other devices in the same job carry on normally.
5. For each reachable device the backend runs `main.py <domain> <action> --target <hostname>`. If that fails, the device is marked `failed`. If it succeeds, `success`.
6. A separate sweep runs every `RETRY_INTERVAL_SECONDS` (default 60), pings the queued devices again and runs the original command on any that have come back.

The job's overall status is worked out from its devices: `failed` if any device genuinely failed, `partial` if some are still waiting for an offline machine, `completed` otherwise. Per-device results are in the `job_host_status` table.

Because the default poll interval is five minutes, a job queued from the UI can sit for a while unless something triggers `/sync-now`. While developing, lower `POLL_INTERVAL_SECONDS` in `.env` or call the endpoint yourself.

Other endpoints on the backend: `GET /health`, `GET /inventory` (shows the current `hosts.ini`), `POST /inventory/refresh`, and `POST /jobs/{id}/run-now`.

## Configuration

Set in `backend/.env`.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses row-level security. Server only, never in the frontend |
| `AUTOMATION_ROOT` | Where `main.py` lives. `/app` inside the container |
| `AUTOMATION_PYTHON_BIN` | Python used to run `main.py`, `python3` by default |
| `ANSIBLE_BECOME_PASSWORD` | sudo password for Linux hosts |
| `ANSIBLE_WINDOWS_PASSWORD` | WinRM password for Windows hosts |
| `ANSIBLE_SSH_PRIVATE_KEY_PATH` | Path to the SSH key inside the container |
| `POLL_INTERVAL_SECONDS` | How often to look for new jobs, 300 by default |
| `RETRY_INTERVAL_SECONDS` | How often to retry offline devices, 60 by default |
| `JOB_TIMEOUT_SECONDS` | Kill a single run after this long, 1800 by default |
| `MAX_CONCURRENT_JOBS` | Jobs running at once, 5 by default |

`.env` holds real passwords, so keep it out of git. `inventory/hosts.ini` is generated and contains them too, so keep that out as well.

## What works today

Three domains are wired into `main.py`:

| Domain | Actions |
| --- | --- |
| `user` | create, delete, add-group, remove-group, grant-admin, revoke-admin, grant-command, lock, unlock, set-password, list |
| `telemetry` | get-stats, kill-process |
| `monitor` | vitals, health, processes, kill-process |

## Known gaps

- Only the container itself has been tested as a target (a device named `wsl_local`, connected with Ansible's local connection). SSH and WinRM to separate machines are set up as described above but have not been run end to end yet.
- Most of the pages in `DomainPages.jsx` (software, config, patches, services, network, logs, provision, compliance, diagnostics, alerts, reports) call domains that do not exist in `main.py`. They queue a job that fails with an argument error until a controller is written for them.
- `BackupPage.jsx` expects streaming endpoints that the backend does not have, and `InventoryPage.jsx` calls an `inventory gather_facts` action that does not exist. The backup playbooks and primitives are in the repo but `main.py` does not route to them.
- The "Cloud" indicator in the top bar is a static dot. It is not tied to a real connection check.
- `WinRM` is plain HTTP with basic auth, and the sudo and Windows passwords sit in `.env` in plain text. That is acceptable for a closed lab network. Ansible Vault or a secrets manager would be the next step up.

## Notes

`utils/csv_store.py` keeps its old name so the controllers did not need to change, but it no longer touches a CSV. It reads and writes the `devices` table in Supabase and regenerates `hosts.ini` from it before each run. `hosts_inventory.csv` is not used any more and can be deleted once you have imported it with `scripts/import_csv_to_supabase.py`. Only `telemetry_log.csv` is still a file, and it is just the activity history behind the dashboard chart.

## Troubleshooting

**`docker exec` says the container is restarting.** It is crashing on startup. Run `docker compose logs --tail=50` and read the last traceback. A missing or misnamed file under `utils/` was the cause the last time this happened.

**`ansible-playbook` fails with `os.get_blocking` on Windows.** You are running it under Windows Python. Use the container.

**A job finishes but "no hosts matched".** The device has an empty `groups` array, or it is marked offline. Check the row in `devices`, then `curl http://localhost:8000/inventory`.

**The UI shows no data.** Check you are signed in, and that your profile has a role. Row-level security returns empty results, not an error, for a user it does not recognise.

**`docker` is not recognised in PowerShell.** The terminal was opened before Docker was installed. Open a new one.
