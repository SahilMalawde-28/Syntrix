// src/pages/BackupPage.jsx
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MeshTexture, CardHeader, Chip, StatusDot, TerminalOutput, Spinner, CountUp } from '../components/ui';
import GaugeRing from '../components/ui/GaugeRing';
import * as api from '../api/client';

const TASKS = [
  { id:'backup_config', title:'Backup Config Files',    sub:'Registry, /etc/hosts, resolv.conf, network interfaces', color:'#4d9bff', delay:0   },
  { id:'verify',        title:'Verify Integrity',       sub:'SHA256 checksum vs .meta.json — detect corruption',      color:'#17c97c', delay:60  },
  { id:'backup_user',   title:'Backup User Data',       sub:'Desktop, Documents, projects — before reimaging',        color:'#a07ee8', delay:120, needsUser:true },
  { id:'restore',       title:'Restore Config',         sub:'Disaster recovery — extract archive to system path',     color:'#f0a020', delay:180, needsBackupId:true },
  { id:'schedule',      title:'Schedule Auto-Backup',   sub:'cron (Linux) · Task Scheduler (Windows)',                color:'#38bdf8', delay:240, needsInterval:true },
  { id:'cleanup',       title:'Cleanup Storage',        sub:'Keep N most recent, delete older archives + metadata',   color:'#e05555', delay:300, needsKeep:true },
];

const STATS = [
  { label:'Last Backup',  value:'2h ago', numeric:false, sub:'hosts_backup_2026-04-11.zip', color:'#17c97c', gauge:92  },
  { label:'Files Stored', value:14,       numeric:true,  sub:'C:\\BackupStorage',           color:'#efefed', gauge:58  },
  { label:'Integrity',    value:'100%',   numeric:false, sub:'14/14 verified valid',        color:'#17c97c', gauge:100 },
  { label:'Scheduled',    value:'Daily',  numeric:false, sub:'2 Task Scheduler entries',    color:'#38bdf8', gauge:75  },
];

const ctr = { hidden:{}, show:{ transition:{ staggerChildren:0.07 } } };
const itm = { hidden:{ opacity:0, y:8 }, show:{ opacity:1, y:0, transition:{ duration:0.26, ease:'easeOut' } } };

export default function BackupPage() {
  const [activeTask, setActiveTask] = useState(null);
  const [lines,      setLines]      = useState([]);
  const [running,    setRunning]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [hosts,      setHosts]      = useState('windows_lab');
  const [backupId,   setBackupId]   = useState('');
  const [username,   setUsername]   = useState('');
  const [interval,   setInterval]   = useState('1440');
  const [keep,       setKeep]       = useState('5');
  const esRef = useRef(null);

  const addLine = (l) => setLines(p => [...p, l]);

  function runStream(getEs) {
    setLines([]); setResult(null); setRunning(true);
    if (esRef.current) esRef.current.close();
    const es = getEs();
    esRef.current = es;
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.done) { es.close(); setRunning(false); setResult({ success: d.returncode === 0 }); }
      else if (d.line !== undefined) addLine(d.line);
    };
    es.onerror = () => { es.close(); setRunning(false); addLine('ERROR: Connection to Flask backend lost.'); };
  }

  async function runPost(fn) {
    setLines([]); setResult(null); setRunning(true);
    addLine('▶ Sending request to Flask backend…');
    try {
      const res = await fn();
      const { stdout, stderr, success } = res.data;
      (stdout||'').split('\n').forEach(l => l && addLine(l));
      if (stderr) stderr.split('\n').forEach(l => l && addLine('STDERR: '+l));
      setResult({ success });
    } catch (err) {
      addLine('ERROR: '+(err.message||'Request failed'));
      setResult({ success: false });
    } finally { setRunning(false); }
  }

  function handleRun(task) {
    setActiveTask(task.id);
    if      (task.id === 'backup_config') runStream(() => api.streamBackup(hosts));
    else if (task.id === 'verify')        runStream(() => api.streamVerify(hosts));
    else if (task.id === 'restore')       { if (!backupId) { alert('Enter a backup_id first'); return; } runStream(() => api.streamRestore(backupId, hosts)); }
    else if (task.id === 'backup_user')   runPost(() => api.backupUser(username||'labuser', hosts));
    else if (task.id === 'schedule')      runPost(() => api.scheduleBackup(parseInt(interval), hosts));
    else if (task.id === 'cleanup')       runPost(() => api.cleanupBackups(parseInt(keep), hosts));
  }

  return (
    <div className="page-enter flex-1 overflow-y-auto" style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>

      {/* Header card */}
      <motion.div className="card" style={{ borderLeft:'2.5px solid #a07ee8' }} initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }}>
        <MeshTexture color="#a07ee8" cx="90%" cy="40%" opacity={0.07} />
        <div className="card-body" style={{ padding:'18px 22px' }}>
          <div className="flex items-center gap-[14px]">
            <div className="flex items-center justify-center rounded-[10px] flex-shrink-0"
              style={{ width:42, height:42, background:'rgba(160,126,232,0.12)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a07ee8" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-[9px] mb-[3px]">
                <span style={{ fontSize:14, fontWeight:700, letterSpacing:'-0.025em', color:'#efefed' }}>Backup &amp; Recovery</span>
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'rgba(160,126,232,0.12)', color:'#a07ee8' }}>DOMAIN 8</span>
              </div>
              <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.35)' }}>
                All 6 tasks wired to Ansible playbooks · Live terminal output · SHA256 verification · SSE streaming
              </div>
            </div>
            {/* Host selector */}
            <div className="flex items-center gap-[8px]">
              <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.35)' }}>Target</span>
              <select value={hosts} onChange={e => setHosts(e.target.value)}
                className="inp" style={{ width:148, height:32, padding:'0 10px', fontSize:11.5, cursor:'pointer',
                  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%234a4a47' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                  backgroundRepeat:'no-repeat', backgroundPosition:'right 9px center', appearance:'none' }}>
                <option value="windows_lab">windows_lab</option>
                <option value="linux_lab">linux_lab</option>
                <option value="lab">all lab</option>
                <option value="windows-main">windows-main</option>
              </select>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stat cards with gauges */}
      <motion.div className="grid gap-[12px]" style={{ gridTemplateColumns:'repeat(4,1fr)' }} variants={ctr} initial="hidden" animate="show">
        {STATS.map((s, i) => (
          <motion.div key={s.label} variants={itm}>
            <motion.div className="card flex items-center gap-[13px]"
              whileHover={{ y:-2, boxShadow:'0 8px 24px rgba(0,0,0,0.42)', borderColor:'rgba(255,255,255,0.11)' }}
              transition={{ type:'spring', stiffness:380, damping:28 }}>
              <MeshTexture color={s.color} cx="80%" cy="30%" opacity={0.08} />
              <div className="card-body flex items-center gap-[13px]" style={{ padding:'16px 18px' }}>
                <GaugeRing value={s.gauge} size={52} strokeWidth={4} color={s.color} delay={i*100+350} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:3 }}>{s.label}</div>
                  <div style={{ fontSize:17, fontWeight:700, letterSpacing:'-0.04em', lineHeight:1, marginBottom:4, color:s.color }}>
                    {s.numeric ? <CountUp value={s.value} delay={i*80+400} /> : s.value}
                  </div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.28)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.sub}</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* Task cards 3-column */}
      <motion.div className="grid gap-[12px]" style={{ gridTemplateColumns:'repeat(3,1fr)' }} variants={ctr} initial="hidden" animate="show">
        {TASKS.map((task) => (
          <motion.div key={task.id} variants={itm}>
            <motion.div className="card flex flex-col gap-[12px]"
              style={{ borderTop:`2px solid ${task.color}`, cursor:'default' }}
              whileHover={{ y:-2, boxShadow:'0 10px 28px rgba(0,0,0,0.45)', borderColor: task.color }}
              transition={{ type:'spring', stiffness:360, damping:28 }}>
              <MeshTexture color={task.color} cx="90%" cy="20%" opacity={0.07} />
              <div className="card-body flex flex-col gap-[12px]">
                {/* Title */}
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#efefed', marginBottom:3 }}>{task.title}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.32)', lineHeight:1.5 }}>{task.sub}</div>
                </div>

                {/* Conditional inputs */}
                {task.needsBackupId && (
                  <input className="inp" style={{ fontSize:11 }}
                    placeholder="backup_id e.g. hosts_backup_2026-04-11_203030.zip"
                    value={backupId} onChange={e => setBackupId(e.target.value)} />
                )}
                {task.needsUser && (
                  <input className="inp" style={{ fontSize:11 }}
                    placeholder="Username e.g. vedan"
                    value={username} onChange={e => setUsername(e.target.value)} />
                )}
                {task.needsInterval && (
                  <div className="flex items-center gap-[7px]">
                    <input className="inp" type="number" style={{ fontSize:11 }}
                      placeholder="Interval (minutes)" value={interval} onChange={e => setInterval(e.target.value)} />
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)', flexShrink:0 }}>min</span>
                  </div>
                )}
                {task.needsKeep && (
                  <div className="flex items-center gap-[7px]">
                    <input className="inp" type="number" style={{ fontSize:11 }}
                      placeholder="Keep N latest" value={keep} onChange={e => setKeep(e.target.value)} />
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)', flexShrink:0 }}>latest</span>
                  </div>
                )}

                {/* Run button */}
                <motion.button
                  className="btn-accent"
                  style={{ background:task.color, color: task.color==='#17c97c' ? '#051a0e' : task.color==='#f0a020' ? '#1a0e00' : '#ffffff', fontSize:11.5, padding:'8px 14px' }}
                  onClick={() => handleRun(task)}
                  disabled={running}
                  whileTap={!running ? { scale:0.97 } : {}}
                >
                  {running && activeTask===task.id ? (
                    <><Spinner size={13} color="currentColor" /> Running…</>
                  ) : (
                    <>▶ Run {task.title}</>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* Live terminal */}
      <AnimatePresence>
        {(lines.length > 0 || running) && (
          <motion.div className="card"
            initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
            exit={{ opacity:0, height:0 }} transition={{ duration:0.22 }}>
            <MeshTexture color="#17c97c" cx="85%" cy="50%" opacity={0.05} />
            <div className="card-body">
              <div className="flex items-center gap-[10px] mb-[12px]">
                <span style={{ fontSize:13, fontWeight:600, color:'#efefed' }}>Live Terminal Output</span>
                {running && <Spinner size={14} />}
                {result && (
                  <Chip variant={result.success ? 'ok' : 'err'}>
                    {result.success ? '✓ Completed — failed=0' : '✕ Failed'}
                  </Chip>
                )}
                <motion.button className="btn-ghost ml-auto" style={{ fontSize:10.5, padding:'5px 10px' }}
                  onClick={() => { setLines([]); setResult(null); }}>
                  Clear
                </motion.button>
              </div>
              <TerminalOutput
                lines={lines}
                title={`ansible-playbook ${activeTask||''} — ${hosts}`}
                height={300}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
