// src/pages/DomainPages.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageShell from '../components/layout/PageShell';
import { MeshTexture, CardHeader, Chip, StatusDot, Input, TerminalOutput, Spinner, CountUp, ProgressBar, Toggle } from '../components/ui';
import * as api from '../api/client';

// ── Shared ActionCard ────────────────────────────────────────────────────────
function ActionCard({ title, sub, color='#4d9bff', icon:Icon, onRun, children }) {
  const [lines,   setLines]   = useState([]);
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);

  async function run() {
    setLines([]); setResult(null); setRunning(true);
    setLines(['▶ Sending to Flask backend…']);
    try {
      const res = await onRun();
      const { stdout, success } = res.data;
      (stdout||'').split('\n').forEach(l => l && setLines(p => [...p, l]));
      setResult({ success });
    } catch (e) {
      setLines(p => [...p, 'ERROR: '+e.message]);
      setResult({ success: false });
    } finally { setRunning(false); }
  }

  return (
    <motion.div className="card flex flex-col gap-[11px]"
      style={{ borderTop:`2px solid ${color}` }}
      whileHover={{ y:-2, boxShadow:'0 10px 28px rgba(0,0,0,0.45)' }}
      transition={{ type:'spring', stiffness:360, damping:28 }}>
      <MeshTexture color={color} cx="90%" cy="20%" opacity={0.07} />
      <div className="card-body flex flex-col gap-[11px]">
        <div className="flex items-start gap-[9px]">
          {Icon && (
            <div className="flex items-center justify-center rounded-[7px] flex-shrink-0"
              style={{ width:30, height:30, background:`${color}14` }}>
              <Icon color={color} size={14} />
            </div>
          )}
          <div>
            <div style={{ fontSize:12.5, fontWeight:600, color:'#efefed', marginBottom:2 }}>{title}</div>
            {sub && <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.32)', lineHeight:1.5 }}>{sub}</div>}
          </div>
        </div>
        {children}
        <motion.button className="btn-accent"
          style={{ background:color, color: color==='#17c97c'?'#051a0e':'white', fontSize:11.5, padding:'8px 14px' }}
          onClick={run} disabled={running}
          whileTap={!running ? { scale:0.97 } : {}}>
          {running ? <><Spinner size={13} color="currentColor" /> Running…</> : <>▶ {title}</>}
        </motion.button>
        {result && <Chip variant={result.success?'ok':'err'}>{result.success?'✓ Success — failed=0':'✕ Failed'}</Chip>}
        {lines.length > 0 && <TerminalOutput lines={lines} title={title} height={150} />}
      </div>
    </motion.div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
const ic = (color, size=14) => ({ width:size, height:size, stroke:color||'currentColor', strokeWidth:2, fill:'none' });
function ServerI({color,size})   { return <svg {...ic(color,size)} viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> }
function UsersI({color,size})    { return <svg {...ic(color,size)} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function PkgI({color,size})      { return <svg {...ic(color,size)} viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> }
function CfgI({color,size})      { return <svg {...ic(color,size)} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> }
function ShieldI({color,size})   { return <svg {...ic(color,size)} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function ActivityI({color,size}) { return <svg {...ic(color,size)} viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function RocketI({color,size})   { return <svg {...ic(color,size)} viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg> }
function ChartI({color,size})    { return <svg {...ic(color,size)} viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-4"/></svg> }
function NetworkI({color,size})  { return <svg {...ic(color,size)} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> }
function FileI({color,size})     { return <svg {...ic(color,size)} viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> }
function CheckI({color,size})    { return <svg {...ic(color,size)} viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> }
function BarI({color,size})      { return <svg {...ic(color,size)} viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function BellI({color,size})     { return <svg {...ic(color,size)} viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
function DiagI({color,size})     { return <svg {...ic(color,size)} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> }

// ── Domain 1: Users ──────────────────────────────────────────────────────────
export function UsersPage() {
  const [u,setU]=useState(''); const [p,setP]=useState('');
  return (
    <PageShell title="Users & Access" domain="Domain 1" icon={UsersI} color="#4d9bff"
      description="Create, delete, lock, and audit user accounts across the entire lab fleet">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <MeshTexture color="#4d9bff" cx="90%" cy="25%" opacity={0.07} />
          <div className="card-body">
            <CardHeader title="Create User" />
            <div className="flex flex-col gap-[8px] mb-[12px]">
              <Input label="Username" placeholder="e.g. john.doe" value={u} onChange={e=>setU(e.target.value)} />
              <Input label="Password" type="password" placeholder="••••••••" value={p} onChange={e=>setP(e.target.value)} />
            </div>
            <button className="btn-accent w-full" onClick={() => api.createUser(u,p)}>Create User</button>
          </div>
        </motion.div>
        <ActionCard title="List All Users" sub="Query local accounts across all nodes" color="#4d9bff" icon={UsersI} onRun={api.listUsers} />
        <ActionCard title="Delete User" sub="Remove account from /etc/shadow or SAM" color="#e05555" icon={UsersI} onRun={() => api.deleteUser(u)}>
          <Input placeholder="Username to delete" value={u} onChange={e=>setU(e.target.value)} />
        </ActionCard>
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <div className="card-body">
            <CardHeader title="Available Tasks" />
            {['Grant sudo','Revoke sudo','Lock user','Unlock user','Set password','Add to group','Remove from group'].map((t,i) => (
              <motion.div key={t} className="flex items-center justify-between py-[8px]"
                style={{ borderBottom: i<6 ? '1px solid rgba(255,255,255,0.045)' : 'none' }}
                whileHover={{ x:2 }} transition={{ duration:0.1 }}>
                <span style={{ fontSize:12, color:'#efefed' }}>{t}</span>
                <Chip variant="run">Playbook ready</Chip>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </PageShell>
  );
}

// ── Domain 2: Software ───────────────────────────────────────────────────────
export function SoftwarePage() {
  const [pkg,setPkg]=useState('');
  return (
    <PageShell title="Software" domain="Domain 2" icon={PkgI} color="#a07ee8"
      description="Install, remove, and audit software across Linux (apt) and Windows (winget)">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr 1fr' }}>
        <ActionCard title="Install Package" sub="apt install / winget install" color="#17c97c" icon={PkgI} onRun={() => api.installSoftware(pkg)}>
          <Input placeholder="e.g. google-chrome, python3" value={pkg} onChange={e=>setPkg(e.target.value)} />
        </ActionCard>
        <ActionCard title="Remove Package" sub="apt remove / winget uninstall" color="#e05555" icon={PkgI} onRun={() => api.removeSoftware(pkg)}>
          <Input placeholder="Package name" value={pkg} onChange={e=>setPkg(e.target.value)} />
        </ActionCard>
        <ActionCard title="Update All Packages" sub="apt upgrade + winget upgrade --all" color="#a07ee8" icon={PkgI} onRun={() => api.updatePatches()} />
      </div>
    </PageShell>
  );
}

// ── Domain 3: Configuration ──────────────────────────────────────────────────
export function ConfigPage() {
  return (
    <PageShell title="Configuration" domain="Domain 3" icon={CfgI} color="#38bdf8"
      description="Manage DNS, hostname, environment variables, and IP forwarding">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        {[
          { title:'Change DNS Server',    sub:'/etc/resolv.conf · Windows Registry', color:'#38bdf8' },
          { title:'Change Hostname',      sub:'/etc/hostname + /etc/hosts',          color:'#a07ee8' },
          { title:'Set Environment Vars', sub:'/etc/environment · Win Registry',     color:'#17c97c' },
          { title:'Enable IP Forwarding', sub:'net.ipv4.ip_forward=1 · sysctl -p',  color:'#f0a020' },
        ].map(t => <ActionCard key={t.title} title={t.title} sub={t.sub} color={t.color} icon={CfgI} onRun={() => api.applyConfig()} />)}
      </div>
    </PageShell>
  );
}

// ── Domain 4: Monitoring ─────────────────────────────────────────────────────
export function MonitorPage() {
  return (
    <PageShell title="Monitoring" domain="Domain 4" icon={ChartI} color="#17c97c"
      description="Real-time CPU, memory, disk, and process metrics across all nodes">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr 1fr' }}>
        <ActionCard title="Check Disk Usage" sub="df -h across all nodes"    color="#17c97c" icon={ChartI} onRun={api.checkDisk}   />
        <ActionCard title="Check Memory"     sub="free -m across all nodes"  color="#4d9bff" icon={ChartI} onRun={api.checkMemory} />
        <ActionCard title="Check Uptime"     sub="uptime across all nodes"   color="#a07ee8" icon={ChartI} onRun={api.checkUptime} />
      </div>
    </PageShell>
  );
}

// ── Domain 5: Patches ────────────────────────────────────────────────────────
export function PatchesPage() {
  return (
    <PageShell title="Patches" domain="Domain 5" icon={ShieldI} color="#f0a020"
      description="Deploy and audit security patches using apt (Linux) and win_updates (Windows)">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <ActionCard title="Update All Packages"   sub="apt upgrade + win_updates on all nodes" color="#f0a020" icon={ShieldI} onRun={() => api.updatePatches()} />
        <ActionCard title="Check Pending Updates" sub="List upgradable packages per node"      color="#e05555" icon={ShieldI} onRun={api.checkUptime} />
      </div>
    </PageShell>
  );
}

// ── Domain 6: Services ───────────────────────────────────────────────────────
export function ServicesPage() {
  const [svc,setSvc]=useState('nginx');
  return (
    <PageShell title="Services" domain="Domain 6" icon={ActivityI} color="#17c97c"
      description="Start, stop, restart daemons via systemd (Linux) and Windows SCM">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr 1fr' }}>
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <div className="card-body">
            <CardHeader title="Service Target" />
            <Input label="Service name" placeholder="e.g. nginx, mysql, sshd" value={svc} onChange={e=>setSvc(e.target.value)} />
          </div>
        </motion.div>
        {['Restart','Start','Stop'].map((a,i) => (
          <ActionCard key={a} title={`${a} Service`} sub={`${a} ${svc} on all nodes`}
            color={['#4d9bff','#17c97c','#e05555'][i]} icon={ActivityI}
            onRun={() => api.restartService(svc)} />
        ))}
      </div>
    </PageShell>
  );
}

// ── Domain 7: Network ────────────────────────────────────────────────────────
export function NetworkPage() {
  const [target,setTarget]=useState('8.8.8.8');
  return (
    <PageShell title="Network" domain="Domain 7" icon={NetworkI} color="#38bdf8"
      description="Ping, traceroute, restart network services, check connectivity">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <div className="card-body">
            <CardHeader title="Target Host / IP" />
            <Input label="Target" placeholder="e.g. 8.8.8.8 or google.com" value={target} onChange={e=>setTarget(e.target.value)} />
          </div>
        </motion.div>
        <ActionCard title="Ping Target" sub={`ping -c 4 ${target}`} color="#38bdf8" icon={NetworkI} onRun={() => api.networkPing(target)} />
        <ActionCard title="Check Connectivity" sub="Verify all nodes reach gateway" color="#17c97c" icon={NetworkI} onRun={() => api.networkPing('8.8.8.8')} />
        <ActionCard title="Restart Network"    sub="NetworkManager / DHCP Client"  color="#f0a020" icon={NetworkI} onRun={() => api.restartService('NetworkManager')} />
      </div>
    </PageShell>
  );
}

// ── Domain 9: Logs ───────────────────────────────────────────────────────────
export function LogsPage() {
  return (
    <PageShell title="Logs & Audits" domain="Domain 9" icon={FileI} color="#a07ee8"
      description="Collect /var/log/syslog, auth.log (Linux) and Event Logs (Windows)">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <ActionCard title="Collect System Logs"   sub="Pull syslog and Event Viewer logs"    color="#a07ee8" icon={FileI} onRun={() => api.collectLogs()} />
        <ActionCard title="Collect Auth Logs"     sub="/var/log/auth.log · SSH login history" color="#4d9bff" icon={FileI} onRun={() => api.collectLogs()} />
        <ActionCard title="Filter Error Events"   sub="grep ERROR/CRITICAL across logs"       color="#e05555" icon={FileI} onRun={() => api.collectLogs()} />
        <ActionCard title="Generate Audit Report" sub="Login, sudo, config change events"     color="#17c97c" icon={FileI} onRun={() => api.collectLogs()} />
      </div>
    </PageShell>
  );
}

// ── Domain 10: Provisioning ──────────────────────────────────────────────────
export function ProvisionPage() {
  return (
    <PageShell title="Provisioning" domain="Domain 10" icon={RocketI} color="#17c97c"
      description="Deploy golden configurations to new machines in one run">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <ActionCard title="Provision New Node"   sub="Full golden config: software + users + network" color="#17c97c" icon={RocketI} onRun={() => api.provisionNode()} />
        <ActionCard title="Deploy Base Software" sub="Install standard lab software stack"            color="#4d9bff" icon={RocketI} onRun={() => api.installSoftware('base-tools')} />
      </div>
    </PageShell>
  );
}

// ── Domain 11: Compliance ────────────────────────────────────────────────────
export function CompliancePage() {
  return (
    <PageShell title="Compliance" domain="Domain 11" icon={CheckI} color="#17c97c"
      description="Enforce password policies, audit sudo rules, verify security standards">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <ActionCard title="Run Compliance Check" sub="Password policies, sudoers, open ports" color="#17c97c" icon={CheckI} onRun={() => api.complianceCheck()} />
        <ActionCard title="Audit Sudo Rules"     sub="Check /etc/sudoers.d/ across all nodes" color="#a07ee8" icon={CheckI} onRun={() => api.complianceCheck()} />
      </div>
    </PageShell>
  );
}

// ── Domain 12: Diagnostics ───────────────────────────────────────────────────
export function DiagnosticsPage() {
  return (
    <PageShell title="Diagnostics" domain="Domain 12" icon={DiagI} color="#38bdf8"
      description="Fleet-wide diagnostics — journalctl, ss -tuln, ip route, systeminfo">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <ActionCard title="Run Fleet Diagnostics" sub="journalctl errors, ss -tuln, ip route" color="#38bdf8" icon={DiagI} onRun={() => api.runDiagnostics()} />
        <ActionCard title="Check Open Ports"      sub="ss -tuln across all nodes"             color="#a07ee8" icon={DiagI} onRun={() => api.runDiagnostics()} />
      </div>
    </PageShell>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────
const NODES = [
  { name:'LNX-SERVER-12',ip:'192.168.1.45', os:'Ubuntu 22',  status:'online',cpu:42,mem:58,disk:55 },
  { name:'WIN-SERVER-02',ip:'192.168.1.21', os:'Windows 11', status:'online',cpu:61,mem:72,disk:78 },
  { name:'LNX-WEB-03',  ip:'192.168.1.67', os:'Debian 11',  status:'warn',  cpu:87,mem:89,disk:91 },
  { name:'WIN-CLIENT-15',ip:'192.168.1.77',os:'Windows 10', status:'online',cpu:28,mem:44,disk:45 },
  { name:'LNX-DB-01',   ip:'192.168.1.90', os:'Ubuntu 20',  status:'online',cpu:55,mem:63,disk:62 },
  { name:'WIN-SERVER-04',ip:'192.168.1.112',os:'Windows S', status:'off',   cpu:0, mem:0, disk:0  },
];
const ctr2 = { hidden:{}, show:{ transition:{ staggerChildren:0.05 } } };
const row2 = { hidden:{ opacity:0, x:-6 }, show:{ opacity:1, x:0, transition:{ duration:0.22 } } };

export function InventoryPage() {
  return (
    <PageShell title="Inventory" domain="All" icon={ServerI} color="#4d9bff"
      description="View and manage all 128 managed nodes">
      <motion.div className="card" initial="hidden" animate="show" variants={ctr2}>
        <MeshTexture color="#4d9bff" cx="90%" cy="20%" opacity={0.06} />
        <div className="card-body">
          <div className="flex items-center justify-between mb-[14px]">
            <div className="flex items-center gap-[8px]">
              <span style={{ fontSize:13, fontWeight:600, color:'#efefed' }}>All Nodes</span>
              <span style={{ fontSize:9.5, fontWeight:700, padding:'1.5px 7px', borderRadius:99, background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.45)' }}>128</span>
            </div>
            <button className="btn-accent" style={{ fontSize:11.5, padding:'6px 14px' }}>+ Add Node</button>
          </div>
          {/* Header */}
          <div className="grid px-[8px] pb-[8px] mb-[3px]"
            style={{ gridTemplateColumns:'1fr 90px 72px 65px 72px 72px 72px 90px', gap:'0 8px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            {['Hostname','IP','OS','Status','CPU','Memory','Disk','Actions'].map(h => <div key={h} className="th">{h}</div>)}
          </div>
          {/* Rows */}
          {NODES.map((n,i) => {
            const linux = n.os.includes('Ubuntu')||n.os.includes('Debian');
            return (
              <motion.div key={n.name} variants={row2}
                className="grid items-center px-[8px] py-[8px] rounded-[7px] border border-transparent cursor-pointer"
                style={{ gridTemplateColumns:'1fr 90px 72px 65px 72px 72px 72px 90px', gap:'0 8px' }}
                whileHover={{ background:'rgba(255,255,255,0.03)', borderColor:'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-[7px]">
                  <StatusDot status={n.status} />
                  <span style={{ fontSize:11.5, fontWeight:500, fontFamily:'monospace', color: n.status==='off'?'rgba(255,255,255,0.28)':'#efefed' }}>{n.name}</span>
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', fontFamily:'monospace' }}>{n.ip}</div>
                <div><span style={{ fontSize:9.5, fontWeight:600, padding:'2px 6px', borderRadius:4, background: linux?'rgba(23,201,124,0.1)':'rgba(77,155,255,0.1)', color: linux?'#17c97c':'#4d9bff' }}>{n.os}</span></div>
                <div><Chip variant={n.status==='online'?'ok':n.status==='warn'?'warn':'err'}>{n.status==='online'?'Online':n.status==='warn'?'Warning':'Offline'}</Chip></div>
                {[n.cpu,n.mem,n.disk].map((v,j) => (
                  <div key={j}>{v>0?(<><div style={{ fontSize:9.5, marginBottom:3, color:v>80?'#e05555':'rgba(255,255,255,0.38)' }}>{v}%</div><ProgressBar value={v} delay={i*40+j*20} height={3}/></>):<span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>—</span>}</div>
                ))}
                <div className="flex gap-[5px]">
                  <motion.button className="btn-ghost" style={{ fontSize:10, padding:'4px 8px' }} whileHover={{ background:'rgba(255,255,255,0.07)' }}>View</motion.button>
                  <motion.button className="btn-ghost" style={{ fontSize:10, padding:'4px 8px' }} whileHover={{ background:'rgba(255,255,255,0.07)' }}>SSH</motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </PageShell>
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────
const ALERTS_DATA = [
  { sev:'crit', title:'High CPU — LNX-WEB-03 at 87%',       meta:'Threshold: 80%',              time:'5m ago'  },
  { sev:'warn', title:"Low disk — WIN-CLIENT-07 at 91%",     meta:'C:\\ drive',                  time:'15m ago' },
  { sev:'crit', title:'nginx stopped — LNX-SERVER-03',       meta:'Auto-restart failed 3×',       time:'1h ago'  },
  { sev:'info', title:'12 pending patches — WIN-SERVER-02',  meta:'Security updates available',   time:'2h ago'  },
  { sev:'warn', title:'Backup verify failed — LNX-DB-01',    meta:'Checksum mismatch on data.zip',time:'3h ago'  },
  { sev:'info', title:'New node registered — WIN-CLIENT-20', meta:'192.168.1.130',                time:'4h ago'  },
];
const sC = { crit:'alert-crit', warn:'alert-warn', info:'alert-info' };
const sT = { crit:'#f87171',    warn:'#fbbf24',    info:'#93c5fd'    };

export function AlertsPage() {
  return (
    <PageShell title="Alerts" domain="Monitor" icon={BellI} color="#e05555"
      description="Active incidents — 7 active, 2 critical, requires attention">
      <div className="flex flex-col gap-[7px]">
        {ALERTS_DATA.map((a,i) => (
          <motion.div key={i} className={`alert-row ${sC[a.sev]} flex items-start gap-[12px]`}
            initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }}
            transition={{ delay: i*0.06, duration:0.22 }}>
            <div className="flex-1">
              <div style={{ fontSize:12.5, fontWeight:600, marginBottom:3, color:sT[a.sev] }}>{a.title}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.32)' }}>{a.meta}</div>
            </div>
            <div className="flex items-center gap-[10px] flex-shrink-0">
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>{a.time}</span>
              <motion.button className="btn-ghost" style={{ fontSize:10.5, padding:'5px 10px' }} whileHover={{ background:'rgba(255,255,255,0.07)' }}>Dismiss</motion.button>
            </div>
          </motion.div>
        ))}
      </div>
    </PageShell>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
const REPORTS = [
  { title:'System Health Report',  icon:ChartI,  color:'#17c97c', date:'May 16, 2026' },
  { title:'Inventory Report',      icon:ServerI, color:'#4d9bff', date:'May 16, 2026' },
  { title:'Compliance Report',     icon:CheckI,  color:'#a07ee8', date:'May 15, 2026' },
  { title:'Patch Report',          icon:ShieldI, color:'#f0a020', date:'May 15, 2026' },
  { title:'Backup Report',         icon:FileI,   color:'#38bdf8', date:'May 14, 2026' },
  { title:'Audit Report',          icon:BarI,    color:'#e05555', date:'May 14, 2026' },
];

export function ReportsPage() {
  return (
    <PageShell title="Reports" domain="Governance" icon={BarI} color="#a07ee8"
      description="Generate and download system reports — health, inventory, compliance, patches">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
        {REPORTS.map((r,i) => (
          <motion.div key={r.title} className="card flex flex-col items-center text-center py-[26px] gap-[11px] cursor-pointer"
            style={{ borderTop:`2px solid ${r.color}` }}
            whileHover={{ y:-3, boxShadow:'0 10px 28px rgba(0,0,0,0.45)' }}
            transition={{ type:'spring', stiffness:360, damping:28 }}
            initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
            transition2={{ delay: i*0.06 }}>
            <MeshTexture color={r.color} cx="80%" cy="30%" opacity={0.08} />
            <div className="flex items-center justify-center rounded-[10px]" style={{ width:44, height:44, background:`${r.color}14`, position:'relative', zIndex:1 }}>
              <r.icon color={r.color} size={20} />
            </div>
            <div style={{ position:'relative', zIndex:1 }}>
              <div style={{ fontSize:12.5, fontWeight:600, color:'#efefed', marginBottom:3 }}>{r.title}</div>
              <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.3)' }}>Last: {r.date}</div>
            </div>
            <motion.button className="btn-ghost w-full" style={{ position:'relative', zIndex:1, fontSize:11 }} whileHover={{ background:'rgba(255,255,255,0.07)' }}>
              Generate Report →
            </motion.button>
          </motion.div>
        ))}
      </div>
    </PageShell>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [notifs,     setNotifs]     = useState(true);
  const [tray,       setTray]       = useState(true);
  const [realtime,   setRealtime]   = useState(false);
  const [flaskUrl,   setFlaskUrl]   = useState('http://127.0.0.1:5000');
  const [invPath,    setInvPath]    = useState('~/automation_platform/inventory/hosts.ini');

  async function toggleAutoLaunch(v) {
    setAutoLaunch(v);
    if (window.electronAPI) await window.electronAPI.setAutoLaunch(v);
  }

  const prefRows = [
    { label:'Launch on startup',        val:autoLaunch, set:toggleAutoLaunch, desc:'Opens automatically when system boots' },
    { label:'Show notifications',       val:notifs,     set:setNotifs,        desc:'System tray alerts for critical events' },
    { label:'Minimize to tray on close',val:tray,       set:setTray,          desc:'Keep running in background' },
    { label:'Real-time monitoring',     val:realtime,   set:setRealtime,      desc:'Live metric polling (higher CPU)' },
  ];

  return (
    <PageShell title="Settings" domain="System" icon={CfgI} color="rgba(255,255,255,0.38)"
      description="App preferences, auto-launch, backend connection">
      <div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1fr' }}>

        {/* Preferences — exactly like IQON Platform Settings card */}
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <div className="card-body">
            <div style={{ fontSize:16, fontWeight:700, color:'#efefed', marginBottom:16, letterSpacing:'-0.02em' }}>Platform Settings</div>
            <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.22)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>General preferences</div>
            {prefRows.map((pref,i) => (
              <motion.div key={pref.label} className="flex items-center justify-between py-[11px]"
                style={{ borderBottom: i<prefRows.length-1 ? '1px solid rgba(255,255,255,0.045)' : 'none' }}
                whileHover={{ x:1 }}>
                <div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.72)', marginBottom:1 }}>{pref.label}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>{pref.desc}</div>
                </div>
                <Toggle on={pref.val} onChange={pref.set} />
              </motion.div>
            ))}
            <div className="flex items-center justify-center gap-[5px] pt-[14px] cursor-pointer"
              style={{ fontSize:12.5, fontWeight:500, color:'rgba(255,255,255,0.38)' }}>
              All Settings <span style={{ fontSize:14 }}>›</span>
            </div>
          </div>
        </motion.div>

        {/* Backend connection */}
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <div className="card-body">
            <CardHeader title="Backend Connection" />
            <div className="flex flex-col gap-[10px]">
              <Input label="Flask Backend URL" value={flaskUrl} onChange={e=>setFlaskUrl(e.target.value)} placeholder="http://127.0.0.1:5000" />
              <Input label="Ansible Inventory Path" value={invPath} onChange={e=>setInvPath(e.target.value)} placeholder="~/automation_platform/inventory/hosts.ini" />
              <button className="btn-accent">Save Connection Settings</button>
            </div>
          </div>
        </motion.div>

        {/* Service status */}
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <div className="card-body">
            <CardHeader title="Service Status" />
            {[
              { label:'Flask Backend', port:':5000', ok:true  },
              { label:'Ansible',       port:'CLI',   ok:true  },
              { label:'WinRM',         port:':5985', ok:true  },
              { label:'Electron IPC',  port:'local', ok:true  },
            ].map((s,i) => (
              <div key={s.label} className="flex items-center justify-between py-[9px]"
                style={{ borderBottom: i<3 ? '1px solid rgba(255,255,255,0.045)' : 'none' }}>
                <div className="flex items-center gap-[8px]">
                  <StatusDot status={s.ok?'online':'off'} />
                  <span style={{ fontSize:12, color:'#efefed' }}>{s.label}</span>
                </div>
                <div className="flex items-center gap-[8px]">
                  <span style={{ fontSize:10, fontFamily:'monospace', color:'rgba(255,255,255,0.28)' }}>{s.port}</span>
                  <Chip variant={s.ok?'ok':'err'}>{s.ok?'Running':'Stopped'}</Chip>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* About */}
        <motion.div className="card" whileHover={{ y:-2 }} transition={{ type:'spring', stiffness:360, damping:28 }}>
          <div className="card-body">
            <CardHeader title="About USAP" />
            {[['Version','2.0.0'],['Platform','Electron + React + Flask'],['Ansible','2.19+'],['Node.js','v22'],['Python','3.12+'],['Author','Vedant Shinde']].map(([k,v],i) => (
              <div key={k} className="flex justify-between items-center py-[8px]"
                style={{ borderBottom: i<5?'1px solid rgba(255,255,255,0.045)':'none' }}>
                <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.4)' }}>{k}</span>
                <span style={{ fontSize:11.5, fontWeight:500, color:'#efefed' }}>{v}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </PageShell>
  );
}
