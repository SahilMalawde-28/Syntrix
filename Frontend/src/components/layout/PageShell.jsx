// src/components/layout/PageShell.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { MeshTexture, Chip } from '../ui';

const ctr = { hidden:{}, show:{ transition:{ staggerChildren:0.08 } } };
const itm = { hidden:{ opacity:0, y:8 }, show:{ opacity:1, y:0, transition:{ duration:0.26, ease:'easeOut' } } };

export default function PageShell({ title, domain, icon:Icon, color='#4d9bff', description, children }) {
  return (
    <motion.div className="page-enter flex-1 overflow-y-auto"
      style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}
      variants={ctr} initial="hidden" animate="show">

      {/* Domain header */}
      <motion.div variants={itm} className="card" style={{ borderLeft:`2.5px solid ${color}` }}>
        <MeshTexture color={color} cx="90%" cy="40%" opacity={0.07} />
        <div className="card-body" style={{ padding:'18px 22px' }}>
          <div className="flex items-center gap-[12px]">
            {Icon && (
              <div className="flex items-center justify-center rounded-[10px] flex-shrink-0"
                style={{ width:40, height:40, background:`${color}15` }}>
                <Icon color={color} size={18} />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-[9px] mb-[3px]">
                <span style={{ fontSize:14, fontWeight:700, letterSpacing:'-0.025em', color:'#efefed' }}>{title}</span>
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:99, background:`${color}15`, color }}>{domain}</span>
              </div>
              <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.35)' }}>{description}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {children || <StubCard title={title} domain={domain} color={color} />}
    </motion.div>
  );
}

function StubCard({ title, domain, color }) {
  return (
    <motion.div variants={{ hidden:{ opacity:0, y:8 }, show:{ opacity:1, y:0, transition:{ duration:0.26 } } }}
      className="card flex flex-col items-center justify-center" style={{ padding:'52px 20px', textAlign:'center' }}>
      <MeshTexture color={color} cx="50%" cy="40%" opacity={0.07} />
      <motion.div className="flex items-center justify-center rounded-full mb-[20px]"
        style={{ width:68, height:68, background:`${color}10`, border:`1.5px solid ${color}22`, position:'relative', zIndex:1 }}
        animate={{ scale:[1,1.04,1], opacity:[0.7,1,0.7] }}
        transition={{ duration:3, repeat:Infinity, ease:'easeInOut' }}>
        <span style={{ fontSize:28 }}>🔌</span>
      </motion.div>
      <div style={{ fontSize:14, fontWeight:700, color:'#efefed', letterSpacing:'-0.02em', marginBottom:8, position:'relative', zIndex:1 }}>
        {title} — Ready for integration
      </div>
      <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.32)', maxWidth:420, lineHeight:1.7, marginBottom:22, position:'relative', zIndex:1 }}>
        Scaffolded with the full design system. Flask backend routes are wired.
        Add your Ansible playbooks and replace this with real UI.
      </div>
      <div className="flex flex-wrap gap-[7px] justify-center mb-[20px]" style={{ position:'relative', zIndex:1 }}>
        {['GET /api/status','POST /api/run','GET /api/list'].map(ep => (
          <div key={ep} style={{ fontFamily:'JetBrains Mono, monospace', fontSize:10.5, padding:'5px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.025)' }}>
            {ep.replace('api/', `api/${domain.toLowerCase().replace(/\s+/g,'_')}/`)}
          </div>
        ))}
      </div>
      <Chip variant="run">Teammate placeholder — wire in playbooks</Chip>
    </motion.div>
  );
}
