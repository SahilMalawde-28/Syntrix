// src/api/client.js
//
// Drop-in replacement for the old Electron bridge. Same call signature as
// window.electronAPI.runAutomation(domain, action, params) and resolves to
// the same { stdout, stderr, status, return_code } shape your pages already
// destructure — so page code barely changes.
//
// Difference: Electron ran main.py locally and returned when the process
// exited. Here the browser INSERTS a job row, the college-server backend
// picks it up, runs main.py, and writes output_log back. So we
// insert, then wait for the row to reach completed/failed.

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// main.py's real argparse contract. Anything not listed here does not exist
// as a sub-parser yet and will fail with exit code 2.
export const MAIN_PY_DOMAINS = {
  user: [
    'create',
    'delete',
    'add-group',
    'remove-group',
    'grant-admin',
    'revoke-admin',
    'grant-command',
    'lock',
    'unlock',
    'set-password',
    'list',
  ],

  telemetry: [
    'get-stats',
    'kill-process',
  ],

  monitor: [
    'vitals',
    'health',
    'processes',
    'kill-process',
  ],
};

let cachedLab = null;

async function currentLab() {
  if (cachedLab) return cachedLab;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not signed in');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('assigned_lab, role')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[Automation] Failed to load profile:', error);
  }

  cachedLab = data?.assigned_lab || 'lab_1';

  return cachedLab;
}

/**
 * Queue a job and wait for the backend to finish it.
 *
 * @param {string} domain
 * @param {string} action
 * @param {object} params
 * @param {function} onLine
 */
export async function runAutomation(
  domain,
  action,
  params = {},
  onLine
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not signed in');
  }

  // Normalize underscores to hyphens:
  // kill_process -> kill-process
  const normalizedAction = action.replace(/_/g, '-');

  const { target = 'all', ...rest } = params;

  // ------------------------------------------------------------
  // CHECK FOR EXISTING PENDING/PROCESSING JOB
  // ------------------------------------------------------------
  // Prevents spamming the jobs table if an identical job is already in flight.

  const { data: existingJob } = await supabase
    .from('jobs')
    .select('*')
    .eq('domain', domain)
    .eq('action', normalizedAction)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let job = existingJob;

  if (!job) {
    // Create new job row
    const { data: newJob, error } = await supabase
      .from('jobs')
      .insert({
        created_by: user.id,
        target_lab: await currentLab(),
        domain,
        action: normalizedAction,
        target,

        // Strip empty values so we don't send empty CLI arguments.
        params: Object.fromEntries(
          Object.entries(rest).filter(
            ([, value]) => value !== '' && value != null
          )
        ),
      })
      .select()
      .single();

    if (error) {
      console.error('[Automation] Failed to create job:', error);
      throw new Error(error.message);
    }

    job = newJob;
    console.log('[Automation] Job created:', job);
  } else {
    console.log('[Automation] Hooking into existing in-flight job:', job);
  }

  // ------------------------------------------------------------
  // WAIT FOR BACKEND
  // ------------------------------------------------------------

  const finished = await waitForJob(
    job.id,
    onLine
  );

  const rawOutput = finished.output_log || '';

  // ------------------------------------------------------------
  // NORMALIZED RESPONSE
  // ------------------------------------------------------------

  const base = {
    stdout: rawOutput,

    stderr:
      finished.status === 'failed'
        ? rawOutput
        : '',

    status:
      finished.status === 'completed'
        ? 'success'
        : 'error',

    return_code:
      finished.exit_code ??
      (finished.status === 'completed' ? 0 : 1),

    job_id: finished.id,
  };

  // ------------------------------------------------------------
  // PARSE BACKEND JSON
  // ------------------------------------------------------------
  // Extract JSON string safely by looking for outer-most bounds { ... } or [ ... ]
  // handles extra log text/banners prepended/appended by backend execution.

  const trimmed = rawOutput.trim();

  try {
    let jsonText = trimmed;

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');

    // Find the outer bounds for JSON object or array
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = trimmed.substring(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      jsonText = trimmed.substring(firstBracket, lastBracket + 1);
    }

    const parsed = JSON.parse(jsonText);

    console.log(
      '[Automation] Parsed JSON response:',
      parsed
    );

    return {
      ...base,
      ...parsed,
    };

  } catch (err) {
    console.error(
      '[Automation] Failed to parse output as JSON:',
      err
    );

    console.error(
      '[Automation] Raw backend output:',
      rawOutput
    );
  }

  // If output wasn't JSON, return the normal response.
  return base;
}

// ============================================================
// WAIT FOR JOB
// ============================================================

function waitForJob(
  jobId,
  onLine,
  timeoutMs = 300000
) {
  return new Promise((resolve, reject) => {
    let done = false;
    let seenChars = 0;

    // Emit newly-added output lines
    const emit = (row) => {
      if (
        onLine &&
        row.output_log &&
        row.output_log.length > seenChars
      ) {
        row.output_log
          .slice(seenChars)
          .split('\n')
          .forEach((line) => {
            if (line.trim()) {
              onLine(line);
            }
          });

        seenChars = row.output_log.length;
      }
    };

    // Finish
    const finish = (row) => {
      if (done) return;

      done = true;

      clearInterval(poll);

      supabase.removeChannel(ch);

      resolve(row);
    };

    // Supabase Realtime
    const ch = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${jobId}`,
        },
        ({ new: row }) => {
          emit(row);

          if (
            row.status === 'completed' ||
            row.status === 'failed'
          ) {
            finish(row);
          }
        }
      )
      .subscribe();

    // Polling fallback - Polls existing job status every 1 second (1000ms)
    const poll = setInterval(async () => {
      try {
        const {
          data: row,
          error,
        } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (error) {
          console.error(
            '[Automation] Job polling error:',
            error
          );
          return;
        }

        if (!row) return;

        emit(row);

        if (
          row.status === 'completed' ||
          row.status === 'failed'
        ) {
          finish(row);
        }

      } catch (err) {
        console.error(
          '[Automation] Job polling exception:',
          err
        );
      }

    }, 1000);

    // Timeout
    setTimeout(() => {
      if (done) return;

      done = true;

      clearInterval(poll);

      supabase.removeChannel(ch);

      reject(
        new Error(
          'Job timed out waiting for backend'
        )
      );
    }, timeoutMs);
  });
}

// ============================================================
// INVENTORY
// ============================================================

export async function getInventoryRegistry() {
  const {
    data,
    error,
  } = await supabase
    .from('devices')
    .select('*');

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  const registry = {};

  for (const d of data) {
    registry[d.hostname] = {
      ip: d.ip_address,

      mac_address:
        d.mac_address || 'UNKNOWN',

      status:
        d.is_online
          ? 'online'
          : 'offline',

      os:
        d.os_type === 'windows'
          ? 'Windows'
          : 'Linux',

      groups:
        d.groups && d.groups.length
          ? d.groups
          : [],
    };
  }

  return {
    success: true,
    registry,
  };
}

// ============================================================
// UPDATE INVENTORY
// ============================================================

export async function updateInventoryRegistry(
  registry
) {
  const rows = Object.entries(registry).map(
    ([hostname, item]) => ({
      hostname,

      ip_address:
        item.ip,

      mac_address:
        item.mac_address === 'UNKNOWN'
          ? null
          : item.mac_address,

      os_type:
        (item.os || 'linux').toLowerCase(),

      groups:
        item.groups || [],

      is_online:
        item.status === 'online',
    })
  );

  const {
    error,
  } = await supabase
    .from('devices')
    .upsert(
      rows,
      {
        onConflict: 'hostname',
      }
    );

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
  };
}