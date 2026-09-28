// src/api/client.js
//
// Drop-in replacement for the old Electron bridge. Same call signature as
// window.electronAPI.runAutomation(domain, action, params) and resolves to
// the same { stdout, stderr, status, return_code } shape your pages already
// destructure — so page code barely changes.
//
// Difference: Electron ran main.py locally and returned when the process
// exited. Here the browser INSERTS a job row, the college-server backend
// picks it up within ~3s, runs main.py, and writes output_log back. So we
// insert, then wait for the row to reach completed/failed.

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// main.py's real argparse contract. Anything not listed here does not exist
// as a sub-parser yet and will fail with exit code 2.
export const MAIN_PY_DOMAINS = {
  user: ['create', 'delete', 'add-group', 'remove-group', 'grant-admin',
    'revoke-admin', 'grant-command', 'lock', 'unlock', 'set-password', 'list'],
  telemetry: ['get-stats', 'kill-process'],
  monitor: ['vitals', 'health', 'processes', 'kill-process'],
};

let cachedLab = null;
async function currentLab() {
  if (cachedLab) return cachedLab;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data } = await supabase
    .from('profiles').select('assigned_lab, role').eq('id', user.id).single();
  cachedLab = data?.assigned_lab || 'lab_1';
  return cachedLab;
}

/**
 * Queue a job and wait for the backend to finish it.
 * @param {string} domain  e.g. 'telemetry'
 * @param {string} action  e.g. 'get-stats'
 * @param {object} params  e.g. { target: 'all', username: 'bob' }
 * @param {function} onLine optional — called per output line as it arrives
 */
export async function runAutomation(domain, action, params = {}, onLine) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // Normalize underscores to hyphens: main.py uses 'kill-process', and some
  // pages still pass 'kill_process'.
  const normalizedAction = action.replace(/_/g, '-');

  const { target = 'all', ...rest } = params;

  const { data: job, error } = await supabase.from('jobs').insert({
    created_by: user.id,
    target_lab: await currentLab(),
    domain,
    action: normalizedAction,
    target,
    // Strip empties so we never emit a bare flag with no value.
    params: Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== '' && v != null)
    ),
  }).select().single();

  if (error) throw new Error(error.message);

  const finished = await waitForJob(job.id, onLine);
  const rawOutput = finished.output_log || '';

  const base = {
    stdout: rawOutput,
    stderr: finished.status === 'failed' ? rawOutput : '',
    status: finished.status === 'completed' ? 'success' : 'error',
    return_code: finished.exit_code ?? (finished.status === 'completed' ? 0 : 1),
    job_id: finished.id,
  };

  // Some controllers (telemetry get-stats, for one) print a single JSON
  // object as their entire stdout — Dashboard.jsx expects that parsed
  // object directly (res.nodes, res.activity, ...), the same shape the old
  // Electron bridge handed back. Merge it in when present; pages that just
  // want plain text (BackupPage, DomainPages) keep using res.stdout as before.
  const trimmed = rawOutput.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return { ...base, ...parsed };
    } catch {
      // Not actually JSON (e.g. a stray '{' in log text) — fall through.
    }
  }

  return base;
}

// Realtime subscription, with a polling fallback in case Realtime isn't
// enabled on the jobs table in your Supabase project.
function waitForJob(jobId, onLine, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    let done = false;
    let seenChars = 0;

    const emit = (row) => {
      if (onLine && row.output_log && row.output_log.length > seenChars) {
        row.output_log.slice(seenChars).split('\n')
          .forEach((l) => l.trim() && onLine(l));
        seenChars = row.output_log.length;
      }
    };

    const finish = (row) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      supabase.removeChannel(ch);
      resolve(row);
    };

    const ch = supabase.channel(`job-${jobId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        ({ new: row }) => {
          emit(row);
          if (row.status === 'completed' || row.status === 'failed') finish(row);
        })
      .subscribe();

    const poll = setInterval(async () => {
      const { data: row } = await supabase
        .from('jobs').select('*').eq('id', jobId).single();
      if (!row) return;
      emit(row);
      if (row.status === 'completed' || row.status === 'failed') finish(row);
    }, 2000);

    setTimeout(() => {
      if (done) return;
      done = true;
      clearInterval(poll);
      supabase.removeChannel(ch);
      reject(new Error('Job timed out waiting for backend'));
    }, timeoutMs);
  });
}

// ── InventoryPage's registry model ──────────────────────────────────────
// InventoryPage doesn't want a flat device list — it wants the old
// electron-bridge shape: an object keyed by hostname/alias, each value
// { ip, mac_address, status, os, groups: [...] }. These two functions
// convert to/from that shape so InventoryPage.jsx needs near-zero changes.

export async function getInventoryRegistry() {
  const { data, error } = await supabase.from('devices').select('*');
  if (error) return { success: false, error: error.message };

  const registry = {};
  for (const d of data) {
    registry[d.hostname] = {
      ip: d.ip_address,
      mac_address: d.mac_address || 'UNKNOWN',
      status: d.is_online ? 'online' : 'offline',
      os: d.os_type === 'windows' ? 'Windows' : 'Linux',
      groups: d.groups && d.groups.length ? d.groups : [],
    };
  }
  return { success: true, registry };
}

// InventoryPage always calls this with the FULL registry (existing entries
// plus whatever changed), so a plain upsert-all is correct — nothing needs
// to be deleted on this path since InventoryPage has no "remove host"
// feature yet.
export async function updateInventoryRegistry(registry) {
  const rows = Object.entries(registry).map(([hostname, item]) => ({
    hostname,
    ip_address: item.ip,
    mac_address: item.mac_address === 'UNKNOWN' ? null : item.mac_address,
    os_type: (item.os || 'linux').toLowerCase(),
    groups: item.groups || [],
    is_online: item.status === 'online',
  }));

  const { error } = await supabase
    .from('devices').upsert(rows, { onConflict: 'hostname' });

  if (error) return { success: false, error: error.message };
  return { success: true };
}