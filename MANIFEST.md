# What to do with every file in this folder

Everything here mirrors its final path inside your `Syntrix/` repo. Copy
each file to the SAME relative path in your repo. What happens to your
existing files depends on the column below.

| File in this package | Action | Notes |
|---|---|---|
| `backend/server.py` | **NEW — just copy** | Doesn't exist in your repo yet. |
| `backend/inventory_builder.py` | **NEW — just copy** | |
| `backend/requirements.txt` | **NEW — just copy** | |
| `backend/Dockerfile` | **NEW — just copy** | |
| `backend/docker-compose.yml` | **NEW — just copy** | |
| `backend/.env.example` | **NEW — copy, then `cp .env.example .env` and fill in real values.** | Never commit `.env`. |
| `backend/group_vars/*.example` | **NEW — copy, rename (drop `.example`), fill in real credentials, then `ansible-vault encrypt` them.** | These are templates. The real filled-in files hold passwords — see the "secrets" note below. |
| `database/schema.sql` | **NEW — run once in the Supabase SQL editor.** | Not a file your app reads at runtime — just paste it into the SQL editor and click Run. |
| `database/migrations/002_inventory_columns.sql` | **NEW — run once, after schema.sql.** | Same: paste into SQL editor. |
| `database/migrations/003_inventory_registry_columns.sql` | **NEW — run once, after 002.** | Adds the `mac_address`/`groups` columns InventoryPage needs. |
| `scripts/import_csv_to_supabase.py` | **NEW — run once** to move `hosts_inventory.csv` into Supabase, then you can delete the CSV. | Optional if you're starting with zero real devices. |
| `Frontend/src/api/client.js` | **NEW — just copy.** This is the file that replaces Electron. | Nothing else in `Frontend/` needs a new file. |
| `Frontend/src/pages/Dashboard.jsx` | **REPLACES your existing file.** | I started from your uploaded file and only changed the lines that called `window.electronAPI`. Everything else — your styling, your components, your logic — is untouched. Diff it against your current file if you want to see exactly what moved. |
| `Frontend/src/pages/DomainPages.jsx` | **REPLACES your existing file.** | Same — only the 5 `window.electronAPI` call sites changed. |
| `Frontend/src/pages/InventoryPage.jsx` | **REPLACES your existing file.** | Same, plus one thing to know: the `gather_facts` call is left calling a domain (`inventory`) that doesn't exist in `main.py` yet — it's commented to explain it'll fail until you add that controller. Everything else in the file works today. |
| `Frontend/src/pages/BackupPage.jsx` | **Copied unchanged — I did NOT modify this one.** | It uses `EventSource`/SSE against a Flask backend that this architecture doesn't have. It needs a real decision (add SSE to `server.py`, or rewrite these 6 tasks to use `api.runAutomation` like everything else) before I touch it — see "Still open" below. |

## Everything NOT listed above (your repo's other files)

`main.py`, `ansible.cfg`, `controllers/`, `primitives/`, `playbooks/`,
`Frontend/src/components/`, `Frontend/package.json` — **leave these alone**,
except:

- `Frontend/package.json`: manually remove `electron`, `electron-builder`,
  `electron-packager` and any `electron*` npm scripts; add
  `"@supabase/supabase-js": "^2.45.0"` to dependencies.
- Delete `Frontend/electron.js` (or `main.js`) and `preload.js` if they exist.
- Delete `hosts_inventory.csv` after running the import script.

## Secrets — do this before anything else touches a real password

The filled-in `group_vars/*.yml` files (not the `.example` templates) will
contain plaintext Windows/Linux credentials. Before you fill them in:
```bash
ansible-vault encrypt inventory/group_vars/windows_lab.yml
ansible-vault encrypt inventory/group_vars/linux_lab.yml
```
And add to `.gitignore`:
```
inventory/hosts.ini
backend/.env
```
(`group_vars/*.yml` can stay in git once vault-encrypted — that's the point
of vault. `hosts.ini` is auto-generated garbage; never commit it.)

## Still open — needs your decision, not more scaffolding

1. **`BackupPage.jsx`** — SSE vs. job-queue rewrite (see table above).
2. **`InventoryPage.jsx`'s `gather_facts`** — needs an `inventory` domain
   added to `main.py`, or rewire it to call `telemetry get-stats` instead.
3. **`SoftwarePage`, `ConfigPage`, `PatchesPage`,** and 8 other
   `GenericDomainPage` instances in `DomainPages.jsx` call domains
   (`software`, `config`, `patches`, ...) that don't exist in `main.py` —
   they'll queue jobs that fail with an argparse error until those
   controllers are written.
