import React, { useState ,useEffect} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageShell from '../components/layout/PageShell';
import { MeshTexture, CardHeader, Chip, Input, TerminalOutput, Spinner, Toggle } from '../components/ui';

function cleanOutputLog(rawStr) {
  if (!rawStr) return '';
  return rawStr
    .replace(/[\u001b\u009b][\({{][0-9;]*[a-zA-K]/g, '') // Remove ANSI color escape codes
    .replace(/\[WARNING\]:.*$/gm, '')                   // Strip standard Ansible warnings
    .replace(/.*world writable directory.*$/gm, '')     // Strip WSL world-writable dir warning
    .replace(/.*cfg-in-world-writable-dir.*$/gm, '')    // Strip config warnings
    .replace(/^\s*[\r\n]/gm, '')                         // Remove empty lines
    .trim();
}

function safeParseJson(rawOutput) {
  if (!rawOutput) return null;
  if (typeof rawOutput === 'object') return rawOutput;

  try {
    return JSON.parse(rawOutput);
  } catch (_) {
    const firstBrace = rawOutput.indexOf('{');
    const lastBrace = rawOutput.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const jsonSub = rawOutput.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonSub);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

function TaskModal({ task, target, onClose, onExecute }) {
  const [username, setUsername] = useState('');
  const [extraParam, setExtraParam] = useState('');

  if (!task) return null;

  const needsPassword = task.action === 'set-password';
  const needsGroup = task.action === 'add-group' || task.action === 'remove-group';
  const needsCommand = task.action === 'grant-command';

  const needsExtraInput = needsPassword || needsGroup || needsCommand;
  
  let extraInputLabel = '';
  let extraPlaceholder = '';
  if (needsPassword) {
    extraInputLabel = 'New Password (--password)';
    extraPlaceholder = '••••••••';
  } else if (needsGroup) {
    extraInputLabel = 'Group Name (--group)';
    extraPlaceholder = 'e.g. sudo or wheel';
  } else if (needsCommand) {
    extraInputLabel = 'Allowed Command (--command)';
    extraPlaceholder = 'e.g. /usr/bin/systemctl restart nginx';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-xl p-5 border border-white/10 shadow-2xl"
        style={{ background: '#16171b' }}
      >
        <h3 className="text-sm font-semibold text-white mb-1">Playbook: {task.title}</h3>
        <p className="text-xs text-white/40 mb-4">Targeting: <code className="text-blue-400">{target || 'all'}</code></p>

        <div className="flex flex-col gap-3 mb-5">
          {task.requiresUser !== false && (
            <Input
              label="Target Username (--username)"
              placeholder="e.g. john.doe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}

          {needsExtraInput && (
            <Input
              label={extraInputLabel}
              type={needsPassword ? 'password' : 'text'}
              placeholder={extraPlaceholder}
              value={extraParam}
              onChange={(e) => setExtraParam(e.target.value)}
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={task.requiresUser !== false && !username.trim()}
            onClick={() => onExecute(task.action, { target: target || 'all', username: username.trim(), extraParam: extraParam.trim() })}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
          >
            Run Playbook
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ActionCard({ title, sub, domain, action, getParams, color = '#4d9bff', icon: Icon, children, onParsedData, disabled }) {
  const [lines, setLines] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showConsole, setShowConsole] = useState(false);

  async function run() {
    setLines([]);
    setResult(null);
    setRunning(true);
    setShowConsole(true);

    const params = getParams ? getParams() : {};
    setLines([`▶ Running: python main.py ${domain} ${action} ...`]);

    try {
      if (!window.electronAPI?.runAutomation) {
        throw new Error('window.electronAPI.runAutomation missing.');
      }

      const res = await window.electronAPI.runAutomation(domain, action, params);

      if (!res) throw new Error('No response returned from Electron bridge.');

      const outputLines = [];
      let parsedData = safeParseJson(res.stdout) || safeParseJson(res);

      if (res.stdout) {
        const cleaned = cleanOutputLog(res.stdout);
        if (cleaned) {
          cleaned.split('\n').forEach((l) => l.trim() && outputLines.push(l.trim()));
        }

        if (parsedData && onParsedData) {
          onParsedData(parsedData);
        }
      }

      if (res.stderr) {
        const cleanedErr = cleanOutputLog(res.stderr);
        if (cleanedErr) {
          const isSuccess = res.status === 'success' || res.return_code === 0;

          cleanedErr.split('\n').forEach((line) => {
            if (!line.trim()) return;

            // Ignore standard non-fatal warnings
            if (
              line.includes('world writable directory') ||
              line.includes('ignoring it as an ansible.cfg source') ||
              line.includes('cfg-in-world-writable-dir') ||
              line.includes('[WARNING]')
            ) {
              return;
            }

            outputLines.push(isSuccess ? `⚠ ${line}` : `[ERR] ${line}`);
          });
        }
      }

      setLines((prev) => [...prev, ...outputLines]);

      const isSuccess = res.status === 'success' || res.return_code === 0;
      
      // Determine cleanest output message
      let displayMsg = isSuccess ? 'Execution completed successfully.' : 'Command failed.';
      if (parsedData?.status) {
        displayMsg = `Status: ${parsedData.status}`;
      } else {
        const validLines = outputLines.filter(l => !l.startsWith('⚠') && !l.includes('[WARNING]'));
        if (validLines.length > 0) {
          displayMsg = validLines[validLines.length - 1];
        }
      }

      setResult({
        success: isSuccess,
        message: displayMsg
      });

    } catch (e) {
      const errText = `ERROR: ${e.message}`;
      setLines((prev) => [...prev, errText]);
      setResult({ success: false, message: errText });
    } finally {
      setRunning(false);
    }
  }

  return (
    <motion.div
      className="card flex flex-col gap-[11px]"
      style={{ borderTop: `2px solid ${color}` }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
    >
      <MeshTexture color={color} cx="90%" cy="20%" opacity={0.07} />
      <div className="card-body flex flex-col gap-[11px]">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-[9px]">
            {Icon && (
              <div
                className="flex items-center justify-center rounded-[7px] flex-shrink-0 mt-0.5"
                style={{ width: 28, height: 28, background: `${color}14` }}
              >
                <Icon color={color} size={14} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#efefed' }}>{title}</div>
              {sub && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)' }}>{sub}</div>}
            </div>
          </div>

          {result && (
            <Chip variant={result.success ? 'ok' : 'err'}>
              {result.success ? '✓ Done' : '✕ Failed'}
            </Chip>
          )}
        </div>

        {children}

        {result && (
          <div className={`p-2 rounded border text-xs font-mono break-all ${result.success ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-red-950/40 border-red-500/30 text-red-300'}`}>
            <span className="font-semibold">{result.success ? 'Output Status:' : 'Error Throwback:'}</span> {result.message}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-1">
          <motion.button
            className="btn-accent flex-1 flex items-center justify-center gap-2"
            style={{ background: color, color: color === '#17c97c' ? '#051a0e' : 'white', fontSize: 11.5, padding: '7px 12px' }}
            onClick={run}
            disabled={running || disabled}
            whileTap={!running && !disabled ? { scale: 0.97 } : {}}
          >
            {running ? (
              <>
                <Spinner size={12} color="currentColor" /> Running command…
              </>
            ) : (
              <>▶ Execute</>
            )}
          </motion.button>

          {lines.length > 0 && (
            <button
              onClick={() => setShowConsole(!showConsole)}
              className="px-2 py-1.5 rounded-md text-[10.5px] border border-white/10 hover:bg-white/5 text-white/60 transition-colors"
            >
              {showConsole ? 'Hide Terminal' : 'Show Terminal'}
            </button>
          )}
        </div>

        {showConsole && lines.length > 0 && (
          <div className="mt-2">
            <TerminalOutput lines={lines} title={`${title} Execution Logs`} height={130} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

const ic = (color, size = 14) => ({ width: size, height: size, stroke: color || 'currentColor', strokeWidth: 2, fill: 'none' });
function UsersI({ color, size }) { return <svg {...ic(color, size)} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 1 0 7.75" /></svg>; }
function CfgI({ color, size }) { return <svg {...ic(color, size)} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>; }
function DefaultI({ color, size }) { return <svg {...ic(color, size)} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></svg>; }

export function UsersPage() {
  const [target, setTarget] = useState('all');
  const [selectedHostFilter, setSelectedHostFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [createUser, setCreateUser] = useState('');
  const [deleteUser, setDeleteUser] = useState('');

  const [activeTaskModal, setActiveTaskModal] = useState(null);
  const [modalExecutionOutput, setModalExecutionOutput] = useState(null);
  const [hostsData, setHostsData] = useState({});

  function handleUserDataParsed(parsed) {
    if (parsed && parsed.hosts) {
      setHostsData(parsed.hosts);
    }
  }

  const allPlaybooks = [
    { title: 'Create User', action: 'create', requiresUser: true },
    { title: 'Delete User', action: 'delete', requiresUser: true },
    { title: 'List All Users', action: 'list', requiresUser: false },
    { title: 'Lock User Account', action: 'lock', requiresUser: true },
    { title: 'Unlock User Account', action: 'unlock', requiresUser: true },
    { title: 'Grant Admin Privilege', action: 'grant-admin', requiresUser: true },
    { title: 'Revoke Admin Privilege', action: 'revoke-admin', requiresUser: true },
    { title: 'Grant Command Privilege', action: 'grant-command', requiresUser: true },
    { title: 'Set User Password', action: 'set-password', requiresUser: true },
    { title: 'Add to System Group', action: 'add-group', requiresUser: true },
    { title: 'Remove from System Group', action: 'remove-group', requiresUser: true },
  ];

  async function executeModalTask(action, rawParams) {
    setActiveTaskModal(null);
    setModalExecutionOutput({ status: 'running', message: `Executing ${action}...` });

    const formattedParams = {
      target: rawParams.target || 'all',
    };

    if (rawParams.username) {
      formattedParams.username = rawParams.username;
    }

    if (action === 'set-password' && rawParams.extraParam) {
      formattedParams.password = rawParams.extraParam;
    } else if ((action === 'add-group' || action === 'remove-group') && rawParams.extraParam) {
      formattedParams.group = rawParams.extraParam;
    } else if (action === 'grant-command' && rawParams.extraParam) {
      formattedParams.command = rawParams.extraParam;
    }

    try {
      if (!window.electronAPI?.runAutomation) {
        throw new Error('Electron API not found.');
      }

      const res = await window.electronAPI.runAutomation('user', action, formattedParams);

      const cleaned = cleanOutputLog(res.stdout || res.stderr || 'Task completed');
      const isSuccess = res.status === 'success' || res.return_code === 0;

      const parsedJson = safeParseJson(res.stdout) || (typeof res === 'object' ? res : null);
      if (parsedJson && parsedJson.hosts) {
        setHostsData(parsedJson.hosts);
      }

      setModalExecutionOutput({
        status: isSuccess ? 'success' : 'error',
        message: cleaned || (isSuccess ? 'Completed successfully.' : 'Task failed.')
      });
    } catch (err) {
      setModalExecutionOutput({
        status: 'error',
        message: `Execution failed: ${err.message}`
      });
    }
  }

  const hostKeys = Object.keys(hostsData);

  return (
    <PageShell
      title="Users & Access Management"
      domain="Domain 1"
      icon={UsersI}
      color="#4d9bff"
      description="Manage system accounts, active inventory, and execution playbooks."
    >
      <div className="grid gap-[12px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
        
        <motion.div className="card col-span-2" whileHover={{ y: -1 }}>
          <div className="card-body flex items-center justify-between py-[10px] gap-4">
            <span style={{ fontSize: 12, fontWeight: 500, color: '#efefed', whiteSpace: 'nowrap' }}>
              Execution Target Hosts (--target):
            </span>
            <Input
              placeholder="e.g. all, linux, 192.168.1.45"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </motion.div>

        <ActionCard
          title="Create Account"
          sub="Add a new system user account"
          domain="user"
          action="create"
          getParams={() => ({ target: target || 'all', username: createUser.trim() })}
          disabled={!createUser.trim()}
          color="#17c97c"
          icon={UsersI}
          onParsedData={handleUserDataParsed}
        >
          <Input
            label="Username (--username)"
            placeholder="e.g. john.doe"
            value={createUser}
            onChange={(e) => setCreateUser(e.target.value)}
          />
        </ActionCard>

        <ActionCard
          title="Scan & Fetch Accounts"
          sub="Retrieve active user accounts across target hosts"
          domain="user"
          action="list"
          getParams={() => ({ target: target || 'all' })}
          color="#4d9bff"
          icon={UsersI}
          onParsedData={handleUserDataParsed}
        />

        <ActionCard
          title="Delete Account"
          sub="Remove user account from targeted systems"
          domain="user"
          action="delete"
          getParams={() => ({ target: target || 'all', username: deleteUser.trim() })}
          disabled={!deleteUser.trim()}
          color="#e05555"
          icon={UsersI}
          onParsedData={handleUserDataParsed}
        >
          <Input
            label="Username to delete (--username)"
            placeholder="e.g. john.doe"
            value={deleteUser}
            onChange={(e) => setDeleteUser(e.target.value)}
          />
        </ActionCard>

        <motion.div className="card" whileHover={{ y: -2 }}>
          <div className="card-body flex flex-col justify-between">
            <div>
              <CardHeader title="User Controller Playbooks" />
              <div className="flex flex-col divide-y divide-white/5 mt-1 max-h-[220px] overflow-y-auto pr-1">
                {allPlaybooks.map((t) => (
                  <div key={t.action} className="flex items-center justify-between py-2">
                    <span style={{ fontSize: 11.5, color: '#efefed' }}>{t.title}</span>
                    <button
                      onClick={() => setActiveTaskModal(t)}
                      className="px-2.5 py-1 rounded text-[11px] font-medium bg-white/5 hover:bg-white/10 text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Run
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {modalExecutionOutput && (
              <div className={`mt-3 p-2 rounded text-xs border ${modalExecutionOutput.status === 'success' ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : modalExecutionOutput.status === 'running' ? 'bg-blue-950/40 border-blue-500/30 text-blue-300' : 'bg-red-950/40 border-red-500/30 text-red-300'}`}>
                <div className="font-semibold capitalize mb-0.5">{modalExecutionOutput.status}:</div>
                <div className="font-mono text-[11px] break-all max-h-24 overflow-y-auto">{modalExecutionOutput.message}</div>
              </div>
            )}
          </div>
        </motion.div>

        {hostKeys.length > 0 && (
          <motion.div className="card col-span-2" whileHover={{ y: -1 }}>
            <div className="card-body flex flex-col gap-3">
              <CardHeader title="Host Account Inventory" />

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Search accounts across hosts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  value={selectedHostFilter}
                  onChange={(e) => setSelectedHostFilter(e.target.value)}
                  className="rounded-md px-3 py-1.5 bg-white/5 border border-white/10 text-xs text-white outline-none"
                >
                  <option value="all" style={{ background: '#121316', color: '#fff' }}>All Target Hosts</option>
                  {hostKeys.map((h) => (
                    <option key={h} value={h} style={{ background: '#121316', color: '#fff' }}>
                      {h} ({hostsData[h].status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto mt-1 rounded-lg border border-white/5">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr className="bg-white/5 text-white/50 border-b border-white/10">
                      <th className="py-2.5 px-3">Target Host</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Discovered Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostKeys
                      .filter((h) => selectedHostFilter === 'all' || selectedHostFilter === h)
                      .map((hostName) => {
                        const hostObj = hostsData[hostName];
                        const isOnline = hostObj.status === 'online';

                        const filteredUsers = (hostObj.users || []).filter((u) =>
                          u.toLowerCase().includes(searchQuery.toLowerCase())
                        );

                        return (
                          <tr key={hostName} className="border-b border-white/5 hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 font-semibold text-white/90">
                              {hostName}
                            </td>
                            <td className="py-2.5 px-3">
                              <Chip variant={isOnline ? 'ok' : 'err'}>
                                {isOnline ? '● Online' : '✕ Offline'}
                              </Chip>
                            </td>
                            <td className="py-2.5 px-3">
                              {isOnline ? (
                                filteredUsers.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {filteredUsers.map((u) => (
                                      <span
                                        key={u}
                                        className="px-2 py-0.5 rounded bg-white/10 text-[11px] text-white/80"
                                      >
                                        {u}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-white/30 text-[11px]">No matching users found</span>
                                )
                              ) : (
                                <span className="text-red-400 text-[11px]">{hostObj.stats || 'Host unreachable'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

      </div>

      <AnimatePresence>
        {activeTaskModal && (
          <TaskModal
            task={activeTaskModal}
            target={target}
            onClose={() => setActiveTaskModal(null)}
            onExecute={executeModalTask}
          />
        )}
      </AnimatePresence>
    </PageShell>
  );
}

function GenericDomainPage({ title, domain, color = '#4d9bff', description, actionName }) {
  const [target, setTarget] = useState('all');

  return (
    <PageShell title={title} domain={domain} icon={DefaultI} color={color} description={description}>
      <div className="grid gap-[12px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <motion.div className="card col-span-2" whileHover={{ y: -1 }}>
          <div className="card-body flex items-center justify-between py-[10px]">
            <span style={{ fontSize: 12, fontWeight: 500, color: '#efefed' }}>Execution Target Hosts:</span>
            <Input
              placeholder="e.g. all, lab, 192.168.1.45"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </motion.div>

        <ActionCard
          title={`Run ${actionName || title}`}
          sub={`Executes: python main.py ${domain.toLowerCase()} ${actionName ? actionName.toLowerCase() : 'run'}`}
          domain={domain.toLowerCase()}
          action={actionName ? actionName.toLowerCase() : 'run'}
          getParams={() => ({ target })}
          color={color}
          icon={DefaultI}
        />
      </div>
    </PageShell>
  );
}

export function SoftwarePage() { return <GenericDomainPage title="Software Management" domain="software" color="#3b82f6" description="Package installations and updates" />; }
export function ConfigPage() { return <GenericDomainPage title="Configuration Files" domain="config" color="#f59e0b" description="System configurations and templates" />; }

// ==========================================
// ANSIBLE OUTPUT PARSING HELPER FUNCTIONS
// ==========================================

/**
 * Extracts valid JSON blocks emitted by Ansible debug tasks 
 * e.g., ok: [wsl_local] => { "msg": [...] }
 */
function parseAnsibleDebugOutput(rawStdout) {
  if (!rawStdout || typeof rawStdout !== 'string') return {};

  const regex = /(?:ok|changed):\s*\[([^\]]+)\]\s*=>\s*(\{[\s\S]*?\n\})/g;
  const hostMap = {};
  let match;

  while ((match = regex.exec(rawStdout)) !== null) {
    const host = match[1];
    const jsonBlock = match[2];

    try {
      const parsed = JSON.parse(jsonBlock);
      if (!hostMap[host]) hostMap[host] = [];
      hostMap[host].push(parsed);
    } catch (err) {
      console.error('Failed to parse inner Ansible JSON block:', err);
    }
  }

  return hostMap;
}

/**
 * Extracts strictly "Up 1:00" or "Up 15 min" from uptime string
 */
function parseCleanUptime(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return 'Active';
  const match = rawStr.match(/up\s+([^,]+)/i);
  return match ? `Up ${match[1].trim()}` : rawStr.trim();
}

/**
 * Parses `df -h` output and isolates root partition '/' or '/mnt/c'
 */
function parseCleanDisk(msgLines) {
  if (!Array.isArray(msgLines) || msgLines.length < 2) return 'Mounted';

  let rootLine = msgLines.find(line => {
    const parts = line.trim().split(/\s+/);
    const mountPoint = parts[parts.length - 1];
    return mountPoint === '/' || mountPoint === '/mnt/c' || mountPoint?.toLowerCase() === 'c:\\';
  });

  if (!rootLine) {
    rootLine = msgLines.find(l => l.includes('/dev/'));
  }

  if (!rootLine) return 'Mounted';

  const parts = rootLine.trim().split(/\s+/);
  if (parts.length >= 6) {
    const size = parts[1];
    const avail = parts[3];
    const percent = parts[4];
    const mount = parts[parts.length - 1];
    return `${avail} free of ${size} (${percent} on ${mount})`;
  }

  return rootLine;
}

/**
 * Parses `free -m` output and calculates percentage ratio
 */
function parseCleanMemory(msgLines) {
  if (!Array.isArray(msgLines)) return 'Synced';
  const memRow = msgLines.find(l => l.trim().startsWith('Mem:'));
  if (!memRow) return 'Active';

  const parts = memRow.trim().split(/\s+/);
  if (parts.length >= 3) {
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    if (!isNaN(total) && !isNaN(used)) {
      const pct = total > 0 ? ((used / total) * 100).toFixed(1) : '0';
      return `${used} MB / ${total} MB (${pct}%)`;
    }
  }

  return 'Active';
}

// ==========================================
// MAIN REACT COMPONENT
// ==========================================

export function MonitorPage() {
  const [target, setTarget] = useState('linux_hosts');
  const [isScanning, setIsScanning] = useState(false);

  // 1. Initialize state from sessionStorage if available (prevents resets on tab switch)
  const [monitoredHosts, setMonitoredHosts] = useState(() => {
    try {
      const saved = sessionStorage.getItem('monitor_hosts_data');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [selectedHost, setSelectedHost] = useState(() => {
    try {
      return sessionStorage.getItem('monitor_selected_host') || null;
    } catch {
      return null;
    }
  });

  // 2. Automatically sync state updates to sessionStorage
  useEffect(() => {
    if (Object.keys(monitoredHosts).length > 0) {
      sessionStorage.setItem('monitor_hosts_data', JSON.stringify(monitoredHosts));
    }
  }, [monitoredHosts]);

  useEffect(() => {
    if (selectedHost) {
      sessionStorage.setItem('monitor_selected_host', selectedHost);
    }
  }, [selectedHost]);

  async function runDeepMonitoringSweep() {
    setIsScanning(true);
    const targetGroup = target.trim() || 'linux_hosts';

    try {
      if (!window.electronAPI?.runAutomation) {
        throw new Error('Electron automation API unavailable.');
      }

      // Execute all monitoring commands concurrently
      const [healthRes, vitalsRes, processRes] = await Promise.all([
        window.electronAPI.runAutomation('monitor', 'health', { target: targetGroup }),
        window.electronAPI.runAutomation('monitor', 'vitals', { target: targetGroup }),
        window.electronAPI.runAutomation('monitor', 'processes', { target: targetGroup })
      ]);

      const builtHostsMap = {};

      // PARSE HEALTH
      const healthData = parseAnsibleDebugOutput(healthRes?.stdout);
      Object.entries(healthData).forEach(([host, records]) => {
        if (!builtHostsMap[host]) builtHostsMap[host] = { host, processes: [] };

        records.forEach(rec => {
          const rawUptime = rec['linux_uptime.stdout'] || (Array.isArray(rec.msg) ? rec.msg.join(' ') : rec.msg);
          builtHostsMap[host].uptime = parseCleanUptime(rawUptime);
        });
      });

      // PARSE DISK
      const diskData = parseAnsibleDebugOutput(vitalsRes?.disk);
      Object.entries(diskData).forEach(([host, records]) => {
        if (!builtHostsMap[host]) builtHostsMap[host] = { host, processes: [] };

        records.forEach(rec => {
          if (Array.isArray(rec.msg)) {
            builtHostsMap[host].diskUsed = parseCleanDisk(rec.msg);
          }
        });
      });

      // PARSE MEMORY
      const memData = parseAnsibleDebugOutput(vitalsRes?.memory);
      Object.entries(memData).forEach(([host, records]) => {
        if (!builtHostsMap[host]) builtHostsMap[host] = { host, processes: [] };

        records.forEach(rec => {
          if (Array.isArray(rec.msg)) {
            builtHostsMap[host].memoryUsed = parseCleanMemory(rec.msg);
          }
        });
      });

      // PARSE PROCESSES
      const processData = parseAnsibleDebugOutput(processRes?.stdout);
      Object.entries(processData).forEach(([host, records]) => {
        if (!builtHostsMap[host]) builtHostsMap[host] = { host, processes: [] };

        records.forEach(rec => {
          if (Array.isArray(rec.msg)) {
            const processes = [];

            rec.msg.forEach(line => {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 11 && !isNaN(parts[1]) && parts[1] !== 'PID') {
                processes.push({
                  user: parts[0],
                  pid: parts[1],
                  cpu: parts[2],
                  mem: parts[3],
                  status: parts[7] || 'Running',
                  command: parts.slice(10).join(' ')
                });
              }
            });

            builtHostsMap[host].processes = processes;
          }
        });
      });

      setMonitoredHosts(builtHostsMap);
      const keys = Object.keys(builtHostsMap);
      if (keys.length > 0 && !selectedHost) {
        setSelectedHost(keys[0]);
      }

    } catch (err) {
      console.error('Sweep execution error:', err);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleKillProcess(hostName, pid) {
    try {
      if (window.electronAPI?.runAutomation) {
        await window.electronAPI.runAutomation('monitor', 'kill_process', { target: hostName, pid });
      }
      setMonitoredHosts(prev => {
        const hostData = prev[hostName];
        if (!hostData) return prev;
        return {
          ...prev,
          [hostName]: {
            ...hostData,
            processes: hostData.processes.filter(p => p.pid !== pid)
          }
        };
      });
    } catch (err) {
      console.error('Failed to kill process:', err);
    }
  }

  const hostKeys = Object.keys(monitoredHosts);
  const activeKey = selectedHost || hostKeys[0];
  const activeDevice = monitoredHosts[activeKey];

  return (
    <div className="p-6 w-full flex flex-col gap-6 text-white font-sans">
      
      {/* Header Banner */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-wide text-emerald-400 flex items-center gap-2">
          <span>🛡️</span> Infrastructure Analytics & System Telemetry
        </h1>
        <p className="text-xs text-white/50">
          Automated multi-playbook deep analytics sweep across connected infrastructure hosts.
        </p>
      </div>

      {/* Top Control Bar */}
      <motion.div className="bg-neutral-900/80 border border-white/10 rounded-xl p-4 shadow-lg backdrop-blur-md" whileHover={{ y: -1 }}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 w-full md:w-auto flex-1">
            <span className="text-xs font-medium text-white/70 whitespace-nowrap">
              Target Group (<code className="text-emerald-400">--target</code>):
            </span>
            <input
              type="text"
              placeholder="e.g. linux_hosts, wsl_local"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 w-full max-w-sm font-mono"
            />
          </div>

          <button
            onClick={runDeepMonitoringSweep}
            disabled={isScanning}
            className="w-full md:w-auto px-6 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Running Sweeps…
              </>
            ) : (
              <>⚡ Run Deep Monitoring Sweep</>
            )}
          </button>

        </div>
      </motion.div>

      {/* Master Host Overview Table */}
      <motion.div className="bg-neutral-900/80 border border-white/10 rounded-xl p-4 shadow-lg backdrop-blur-md" whileHover={{ y: -1 }}>
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-white/90">Connected Infrastructure Nodes Overview</h2>

          {hostKeys.length === 0 ? (
            <div className="py-12 text-center text-white/30 text-xs border border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center gap-2">
              <span>No telemetry data loaded.</span>
              <span className="text-emerald-400 font-medium">Click "Run Deep Monitoring Sweep" above to scan hosts.</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/30">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-white/5 text-white/50 border-b border-white/10 font-medium">
                    <th className="py-2.5 px-3">Host Name</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Uptime</th>
                    <th className="py-2.5 px-3">Memory Usage</th>
                    <th className="py-2.5 px-3">Disk Space</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hostKeys.map((key) => {
                    const h = monitoredHosts[key];
                    const isSelected = activeKey === key;
                    return (
                      <tr 
                        key={key} 
                        className={`border-b border-white/5 transition-colors cursor-pointer ${isSelected ? 'bg-emerald-500/10' : 'hover:bg-white/[0.02]'}`}
                        onClick={() => setSelectedHost(key)}
                      >
                        <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2 font-mono">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          {h.host}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Online
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-white/80">{h.uptime || 'Active'}</td>
                        <td className="py-2.5 px-3 font-mono text-purple-400">{h.memoryUsed || 'Synced'}</td>
                        <td className="py-2.5 px-3 font-mono text-blue-400">{h.diskUsed || 'Mounted'}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedHost(key); }}
                            className="px-2.5 py-1 rounded bg-white/10 hover:bg-emerald-600 text-xs text-white transition-colors"
                          >
                            Inspect →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* Selected Host Process Details Table with Scrollable Wrapper */}
      {activeDevice && (
        <motion.div className="bg-neutral-900/80 border border-white/10 rounded-xl p-4 shadow-lg backdrop-blur-md flex flex-col shrink-0" whileHover={{ y: -1 }}>
          <div className="flex flex-col gap-4">
            
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Active Processes: <span className="font-mono text-emerald-400">{activeDevice.host}</span>
                </h3>
                <p className="text-[11px] text-white/40 mt-0.5">Top processes consuming system resources on target host.</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-white/60 font-mono">
                {activeDevice.processes.length} Processes
              </span>
            </div>

            {activeDevice.processes.length === 0 ? (
              <div className="py-8 text-center text-white/30 text-xs border border-dashed border-white/10 rounded-lg">
                No process metrics returned for this host.
              </div>
            ) : (
              <div className="block max-h-[380px] overflow-y-auto overflow-x-auto rounded-lg border border-white/10 bg-black/30">
                <table className="w-full text-left border-collapse text-xs relative">
                  <thead className="sticky top-0 bg-neutral-900 text-white/50 font-medium z-10">
                    <tr className="border-b border-white/10">
                      <th className="py-2.5 px-3 bg-neutral-900">PID</th>
                      <th className="py-2.5 px-3 bg-neutral-900">User</th>
                      <th className="py-2.5 px-3 bg-neutral-900">% CPU</th>
                      <th className="py-2.5 px-3 bg-neutral-900">% MEM</th>
                      <th className="py-2.5 px-3 bg-neutral-900">Command Signature</th>
                      <th className="py-2.5 px-3 bg-neutral-900 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activeDevice.processes.map((proc, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 px-3 font-mono text-emerald-400 font-semibold">{proc.pid}</td>
                        <td className="py-2 px-3 text-white/80">{proc.user}</td>
                        <td className="py-2 px-3 font-mono text-amber-400 font-semibold">{proc.cpu}%</td>
                        <td className="py-2 px-3 font-mono text-purple-400">{proc.mem}%</td>
                        <td className="py-2 px-3 font-mono text-white/70 truncate max-w-md">{proc.command}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleKillProcess(activeDevice.host, proc.pid)}
                            className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500 text-[11px] text-red-300 hover:text-white border border-red-500/30 transition-all font-medium"
                          >
                            Kill Task ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </motion.div>
      )}

    </div>
  );
}
export function PatchesPage() { return <GenericDomainPage title="Patch Management" domain="patches" color="#ec4899" description="System patch levels and upgrades" />; }
export function ServicesPage() { return <GenericDomainPage title="System Services" domain="services" color="#8b5cf6" description="Daemon status and lifecycle control" />; }
export function NetworkPage() { return <GenericDomainPage title="Network Management" domain="network" color="#06b6d4" description="Interface and routing settings" />; }
export function LogsPage() { return <GenericDomainPage title="Log Collection" domain="logs" color="#64748b" description="Syslog and journald inspection" />; }
export function ProvisionPage() { return <GenericDomainPage title="Host Provisioning" domain="provision" color="#f43f5e" description="Automated initial setup" />; }
export function CompliancePage() { return <GenericDomainPage title="Security Compliance" domain="compliance" color="#14b8a6" description="Audit benchmarks and CIS checks" />; }
export function DiagnosticsPage() { return <GenericDomainPage title="System Diagnostics" domain="diagnostics" color="#eab308" description="Hardware and network testing" />; }
export function AlertsPage() { return <GenericDomainPage title="Alert Notifications" domain="alerts" color="#ef4444" description="Threshold triggers and webhooks" />; }
export function ReportsPage() { return <GenericDomainPage title="Summary Reports" domain="reports" color="#6366f1" description="Infrastructure summary exports" />; }

export function SettingsPage() {
  const [autoLaunch, setAutoLaunch] = useState(true);

  async function toggleAutoLaunch(v) {
    setAutoLaunch(v);
    if (window.electronAPI?.setAutoLaunch) await window.electronAPI.setAutoLaunch(v);
  }

  return (
    <PageShell title="Settings" domain="System" icon={CfgI} color="rgba(255,255,255,0.38)" description="App preferences">
      <div className="card max-w-[500px]">
        <div className="card-body">
          <CardHeader title="General Preferences" />
          <div className="flex items-center justify-between py-[11px]">
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Launch on startup</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>Opens automatically on system boot</div>
            </div>
            <Toggle on={autoLaunch} onChange={toggleAutoLaunch} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}