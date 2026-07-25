// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, StatusDot, Chip, CountUp, ProgressBar, MeshTexture } from '../components/ui';
import GaugeRing from '../components/ui/GaugeRing';

// ── Static data ───────────────────────────────────────────────────────────────
const TASK_DATA = [
  { day: 'Mon', success: 28, failed: 3 },
  { day: 'Tue', success: 35, failed: 5 },
  { day: 'Wed', success: 40, failed: 2 },
  { day: 'Thu', success: 32, failed: 6 },
  { day: 'Fri', success: 45, failed: 4 },
  { day: 'Sat', success: 38, failed: 3 },
  { day: 'Sun', success: 42, failed: 5 },
];

const NODES = [
  { name: 'LNX-SERVER-12', ip: '192.168.1.45',  os: 'Ubuntu 22',  status: 'online', cpu: 42 },
  { name: 'WIN-SERVER-02', ip: '192.168.1.21',  os: 'Windows 11', status: 'online', cpu: 61 },
  { name: 'LNX-WEB-03',   ip: '192.168.1.67',  os: 'Debian 11',  status: 'warn',   cpu: 87 },
  { name: 'WIN-CLIENT-15',ip: '192.168.1.77',  os: 'Windows 10', status: 'online', cpu: 28 },
  { name: 'LNX-DB-01',    ip: '192.168.1.90',  os: 'Ubuntu 20',  status: 'online', cpu: 55 },
  { name: 'WIN-SERVER-04',ip: '192.168.1.112', os: 'Windows S',  status: 'off',    cpu: 0  },
];

const ALERTS = [
  { sev: 'crit', title: 'High CPU — 87%',      meta: 'LNX-WEB-03 · threshold 80%',   time: '5m ago' },
  { sev: 'warn', title: "Disk at 91% — C:\\",  meta: 'WIN-CLIENT-07 · drive full',    time: '15m'    },
  { sev: 'crit', title: 'nginx stopped',        meta: 'LNX-SERVER-03 · restart failed',time: '1h'     },
  { sev: 'info', title: '12 pending updates',   meta: 'WIN-SERVER-02 · security',      time: '2h'     },
  { sev: 'warn', title: 'Backup verify failed', meta: 'LNX-DB-01 · checksum',          time: '3h'     },
];

const ACTIVITY = [
  { type:'ok',  title:'backup_config_files.yml executed',           meta:'WIN-CLIENT-01 · failed=0 changed=7',   time:'2m ago' },
  { type:'ok',  title:'User john.doe created on WIN-CLIENT-15',     meta:'Domain admin · create_user.yml',        time:'10m'    },
  { type:'ok',  title:'Google Chrome installed on LNX-CLIENT-08',  meta:'apt install · install_package.yml',     time:'25m'    },
  { type:'run', title:'restore_config.yml running on WIN-SERVER-02',meta:'Network config · triggered by alert',  time:'1h ago' },
  { type:'err', title:'Patch deployment failed on LNX-WEB-03',     meta:'Dependency conflict · patch_update.yml',time:'2h ago' },
  { type:'ok',  title:'DNS configuration applied fleet-wide',       meta:'All nodes · /etc/resolv.conf synced',  time:'3h ago' },
];

const TASKS = [
  { name: 'verify_backups.yml',   host: 'All lab nodes', status: 'run'  },
  { name: 'patch_update.yml',     host: 'WIN-SERVER-02', status: 'warn' },
  { name: 'cleanup_backups.yml',  host: 'windows_lab',   status: 'run'  },
  { name: 'backup_user_data.yml', host: 'WIN-CLIENT-15', status: 'ok'   },
];

const KPIS = [
  { label:'Total nodes',    value:128, sub:'+12 this week',  subC:'#17c97c', color:'#4d9bff',  icon:'🖥',  delay:0   },
  { label:'Online now',     value:116, sub:'90.6% of fleet', subC:'rgba(255,255,255,0.35)', color:'#17c97c', icon:'📡', delay:80  },
  { label:'Active alerts',  value:7,   sub:'2 critical',     subC:'#e05555', color:'#e05555', icon:'🔔',  delay:160 },
  { label:'Pending patches',value:23,  sub:'5 critical',     subC:'#e05555', color:'#f0a020', icon:'🔒',  delay:240 },
  { label:'Backups today',  value:6,   sub:'All verified ✓', subC:'#17c97c', color:'#a07ee8', icon:'💾',  delay:320 },
];

const alertCls = { crit:'alert-crit', warn:'alert-warn', info:'alert-info' };
const alertTC  = { crit:'#f87171',    warn:'#fbbf24',    info:'#93c5fd'    };
const actBg    = { ok:'rgba(23,201,124,0.10)',  err:'rgba(224,85,85,0.10)',  run:'rgba(77,155,255,0.10)'  };
const actC     = { ok:'#17c97c',               err:'#e05555',               run:'#4d9bff'                };
const actChip  = { ok:'ok',                    err:'err',                   run:'run'                    };
const actLabel = { ok:'Success',               err:'Failed',                run:'Running'                };

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#1a1a1d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'9px 11px', fontSize:11 }}>
      <div style={{ color:'rgba(255,255,255,0.45)', marginBottom:5 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <div style={{ width:8, height:8, borderRadius:2, background:p.color }} />
          <span style={{ color:'rgba(255,255,255,0.45)' }}>{p.name}:</span>
          <span style={{ fontWeight:600, color:'#efefed', marginLeft:'auto', paddingLeft:8 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const ctr = { hidden:{}, show:{ transition:{ staggerChildren:0.065 } } };
const itm = { hidden:{ opacity:0, y:7 }, show:{ opacity:1, y:0, transition:{ duration:0.26, ease:'easeOut' } } };

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="page-enter flex-1 overflow-y-auto" style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>

      {/* KPI strip */}
      <motion.div className="grid gap-[12px]" style={{ gridTemplateColumns:'repeat(5,1fr)' }} variants={ctr} initial="hidden" animate="show">
        {KPIS.map((k) => (
          <motion.div key={k.label} variants={itm}>
            <motion.div
              className="card"
              style={{ cursor:'pointer' }}
              whileHover={{ y:-3, boxShadow:'0 10px 28px rgba(0,0,0,0.45)', borderColor:'rgba(255,255,255,0.11)' }}
              transition={{ type:'spring', stiffness:380, damping:28 }}
            >
              <MeshTexture color={k.color} cx="85%" cy="30%" opacity={0.08} />
              <div className="card-body" style={{ padding:'16px 18px' }}>
                <div className="flex items-center justify-between mb-[10px]">
                  <div className="flex items-center justify-center rounded-[7px]"
                    style={{ width:28, height:28, background:`${k.color}18`, fontSize:13 }}>
                    {k.icon}
                  </div>
                  <div style={{ fontSize:10, fontWeight:500, color:k.subC }}>{k.sub}</div>
                </div>
                <div style={{ fontSize:10.5, fontWeight:500, color:'rgba(255,255,255,0.4)', marginBottom:4 }}>{k.label}</div>
                <CountUp value={k.value} delay={k.delay}
                  style={{ fontSize:26, fontWeight:700, letterSpacing:'-0.06em', lineHeight:1, color:k.color }} />
              </div>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* Row 2: Node list | Fleet gauge | Active alerts */}
      <motion.div className="grid gap-[12px]" style={{ gridTemplateColumns:'1.6fr 1fr 1fr' }} variants={ctr} initial="hidden" animate="show">

        {/* Node inventory */}
        <motion.div variants={itm} className="card">
          <MeshTexture color="#4d9bff" cx="90%" cy="20%" opacity={0.07} />
          <div className="card-body">
            <CardHeader title="Node inventory" action={() => navigate('/inventory')} />
            {/* Column labels */}
            <div className="grid gap-[8px] px-[7px] pb-[7px] mb-[3px]"
              style={{ gridTemplateColumns:'1fr 88px 62px 46px', borderBottom:'1px solid rgba(255,255,255,0.045)' }}>
              {['Hostname','IP Address','OS','CPU'].map(h => (
                <div key={h} className="th">{h}</div>
              ))}
            </div>
            {NODES.map((n, i) => {
              const linux = n.os.includes('Ubuntu') || n.os.includes('Debian');
              return (
                <motion.div key={n.name}
                  className="grid items-center gap-[8px] px-[7px] py-[7px] rounded-[7px] cursor-pointer border border-transparent"
                  style={{ gridTemplateColumns:'1fr 88px 62px 46px' }}
                  whileHover={{ background:'rgba(255,255,255,0.03)', borderColor:'rgba(255,255,255,0.06)' }}
                  initial={{ opacity:0, x:-4 }} animate={{ opacity:1, x:0 }}
                  transition={{ delay: i*0.04, duration:0.22 }}
                >
                  <div className="flex items-center gap-[7px]">
                    <StatusDot status={n.status} />
                    <span style={{ fontSize:11.5, fontWeight:500, color: n.status==='off' ? 'rgba(255,255,255,0.28)' : '#efefed', fontVariantNumeric:'tabular-nums' }}>{n.name}</span>
                  </div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', fontFamily:'monospace' }}>{n.ip}</div>
                  <div>
                    <span style={{ fontSize:9.5, fontWeight:600, padding:'2px 6px', borderRadius:4,
                      background: linux ? 'rgba(23,201,124,0.1)' : 'rgba(77,155,255,0.1)',
                      color:      linux ? '#17c97c' : '#4d9bff' }}>
                      {n.os}
                    </span>
                  </div>
                  <div>
                    {n.cpu > 0 ? (
                      <>
                        <div style={{ fontSize:9.5, textAlign:'right', marginBottom:2, color: n.cpu>80?'#e05555':'rgba(255,255,255,0.35)' }}>{n.cpu}%</div>
                        <ProgressBar value={n.cpu} delay={i*60} height={3} />
                      </>
                    ) : <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>—</span>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Fleet resources with gauge */}
        <motion.div variants={itm} className="card flex flex-col">
          <MeshTexture color="#17c97c" cx="85%" cy="25%" opacity={0.07} />
          <div className="card-body flex flex-col flex-1">
            <CardHeader title="Fleet resources" action={() => navigate('/monitor')} actionLabel="Live →" />
            {/* Gauge + status */}
            <div className="flex items-center gap-[14px] mb-[16px]">
              <GaugeRing value={42} size={74} color="#4d9bff" label="42" sublabel="% CPU" delay={250} />
              <div className="flex-1">
                <div style={{ fontSize:11.5, fontWeight:600, color:'#efefed', marginBottom:3 }}>Average CPU</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginBottom:9 }}>128 nodes · 4 cores avg</div>
                <div className="flex items-center gap-[5px]" style={{ display:'inline-flex', background:'rgba(23,201,124,0.1)', borderRadius:99, padding:'3px 9px' }}>
                  <motion.div style={{ width:5, height:5, borderRadius:'50%', background:'#17c97c' }} animate={{ opacity:[1,0.3,1] }} transition={{ duration:2, repeat:Infinity }} />
                  <span style={{ fontSize:10, fontWeight:700, color:'#17c97c' }}>Optimal</span>
                </div>
              </div>
            </div>
            {/* Resource bars */}
            <div style={{ borderTop:'1px solid rgba(255,255,255,0.05)', paddingTop:13, display:'flex', flexDirection:'column', gap:9 }}>
              {[
                { label:'CPU',     val:42, color:'#4d9bff', delay:200 },
                { label:'Memory',  val:58, color:'#f0a020', delay:280 },
                { label:'Disk',    val:67, color:'#e05555', delay:360 },
                { label:'Network', val:18, color:'#17c97c', delay:440 },
              ].map(r => (
                <div key={r.label}>
                  <div className="flex justify-between mb-[4px]" style={{ fontSize:11 }}>
                    <span style={{ color:'rgba(255,255,255,0.4)' }}>{r.label}</span>
                    <span style={{ fontWeight:600, color:'#efefed' }}>{r.val}%</span>
                  </div>
                  <ProgressBar value={r.val} color={r.color} delay={r.delay} />
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Active alerts */}
        <motion.div variants={itm} className="card">
          <MeshTexture color="#e05555" cx="85%" cy="25%" opacity={0.06} />
          <div className="card-body">
            <CardHeader title="Active alerts" action={() => navigate('/alerts')} />
            <div className="flex flex-col gap-[5px]">
              {ALERTS.map((a, i) => (
                <motion.div key={i} className={`alert-row ${alertCls[a.sev]}`}
                  initial={{ opacity:0, x:6 }} animate={{ opacity:1, x:0 }}
                  transition={{ delay: i*0.06+0.3, duration:0.2 }}>
                  <div>
                    <div style={{ fontSize:11.5, fontWeight:600, marginBottom:2, color:alertTC[a.sev] }}>{a.title}</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{a.meta}</div>
                  </div>
                  <div style={{ fontSize:9.5, color:'rgba(255,255,255,0.25)', flexShrink:0, whiteSpace:'nowrap' }}>{a.time}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Row 3: Activity | Chart + Tasks */}
      <motion.div className="grid gap-[12px]" style={{ gridTemplateColumns:'1fr 1.35fr' }} variants={ctr} initial="hidden" animate="show">

        {/* Recent activity */}
        <motion.div variants={itm} className="card">
          <MeshTexture color="#a07ee8" cx="85%" cy="20%" opacity={0.06} />
          <div className="card-body">
            <CardHeader title="Recent activity" />
            {ACTIVITY.map((a, i) => (
              <motion.div key={i}
                className="flex items-start gap-[9px] py-[8px] px-[4px] -mx-[4px] rounded-[7px] cursor-pointer"
                style={{ borderBottom: i < ACTIVITY.length-1 ? '1px solid rgba(255,255,255,0.042)' : 'none' }}
                whileHover={{ background:'rgba(255,255,255,0.025)' }}
                initial={{ opacity:0 }} animate={{ opacity:1 }}
                transition={{ delay: i*0.04+0.35 }}
              >
                <div className="flex items-center justify-center rounded-[6px] flex-shrink-0 mt-[1px]"
                  style={{ width:24, height:24, background:actBg[a.type] }}>
                  {a.type==='ok'  && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={actC.ok}  strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                  {a.type==='err' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={actC.err} strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                  {a.type==='run' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={actC.run} strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize:11.5, fontWeight:500, color:'#efefed', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:1.5 }}>{a.title}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{a.meta}</div>
                </div>
                <div className="flex flex-col items-end gap-[3px] flex-shrink-0">
                  <Chip variant={actChip[a.type]}>{actLabel[a.type]}</Chip>
                  <span style={{ fontSize:9.5, color:'rgba(255,255,255,0.25)' }}>{a.time}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right col */}
        <div className="flex flex-col gap-[12px]">
          {/* Task chart */}
          <motion.div variants={itm} className="card flex-1">
            <MeshTexture color="#17c97c" cx="85%" cy="20%" opacity={0.06} />
            <div className="card-body">
              <div className="flex items-center justify-between mb-[10px]">
                <span style={{ fontSize:13, fontWeight:600, letterSpacing:'-0.015em', color:'#efefed' }}>Task execution · 7 days</span>
                <div className="flex gap-[12px]">
                  {[{ color:'#17c97c', label:'Success' },{ color:'#e05555', label:'Failed' }].map(l => (
                    <div key={l.label} className="flex items-center gap-[5px]">
                      <div style={{ width:12, height:2, background:l.color, borderRadius:1 }} />
                      <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.38)' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Inline stats above chart — IQON style */}
              <div className="flex gap-[22px] mb-[12px]">
                {[{ label:'Avg success / day', val:'37.1', color:'#17c97c' },{ label:'Avg failures / day', val:'4.0', color:'#e05555' },{ label:'Success rate', val:'90.3%', color:'#efefed' }].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize:9.5, color:'rgba(255,255,255,0.3)', marginBottom:2 }}>{s.label}</div>
                    <div style={{ fontSize:17, fontWeight:700, letterSpacing:'-0.04em', color:s.color }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ height:105 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={TASK_DATA}>
                    <defs>
                      <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#17c97c" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#17c97c" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#e05555" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#e05555" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fill:'rgba(255,255,255,0.25)', fontSize:10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:'rgba(255,255,255,0.25)', fontSize:10 }} axisLine={false} tickLine={false} width={22} />
                    <Tooltip content={<TooltipBox />} cursor={{ stroke:'rgba(255,255,255,0.04)', strokeWidth:1 }} />
                    <Area type="monotone" dataKey="success" stroke="#17c97c" strokeWidth={1.5} fill="url(#gs)"
                      dot={{ r:2.5, fill:'#17c97c', strokeWidth:0 }} activeDot={{ r:4, fill:'#17c97c' }} />
                    <Area type="monotone" dataKey="failed"  stroke="#e05555" strokeWidth={1.5} fill="url(#gf)"
                      dot={{ r:2.5, fill:'#e05555', strokeWidth:0 }} activeDot={{ r:4, fill:'#e05555' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>

          {/* Pending tasks */}
          <motion.div variants={itm} className="card">
            <div className="card-body">
              <CardHeader title="Pending tasks" action={() => {}} actionLabel="Queue →" />
              <div className="flex flex-col gap-[5px]">
                {TASKS.map((t, i) => (
                  <motion.div key={t.name}
                    className="flex items-center gap-[8px] px-[9px] py-[8px] rounded-[7px] border cursor-pointer"
                    style={{ background:'rgba(255,255,255,0.018)', borderColor:'rgba(255,255,255,0.055)' }}
                    whileHover={{ background:'rgba(255,255,255,0.04)', borderColor:'rgba(255,255,255,0.10)' }}
                    initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay: i*0.05+0.5 }}
                  >
                    <StatusDot status={t.status==='ok'?'online':t.status==='warn'?'warn':'online'} />
                    <span style={{ flex:1, fontSize:11.5, fontWeight:500, color:'#efefed', fontFamily:'JetBrains Mono, monospace' }}>{t.name}</span>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)', minWidth:90 }}>{t.host}</span>
                    <Chip variant={t.status==='ok'?'ok':t.status==='warn'?'warn':'run'}>
                      {t.status==='ok'?'Ready':t.status==='warn'?'Pending':'Queued'}
                    </Chip>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
