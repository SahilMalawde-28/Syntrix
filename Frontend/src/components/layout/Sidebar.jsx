// src/components/layout/Sidebar.jsx
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const NAV = [
  {
    section: 'Overview',
    items: [
      { to: '/inventory', label: 'Inventory', icon: ServerIcon, badge: '128', bc: 'g' },
    ],
  },
  {
    section: 'Manage',
    expandable: true,
    key: 'manage',
    icon: WrenchIcon,
    label: 'Manage',
    children: [
      { to: '/users',     label: 'Users & Access' },
      { to: '/software',  label: 'Software' },
      { to: '/config',    label: 'Configuration' },
      { to: '/patches',   label: 'Patches', badge: '23', bc: 'a' },
      { to: '/services',  label: 'Services' },
      { to: '/provision', label: 'Provisioning' },
    ],
  },
  {
    section: 'Monitor',
    expandable: true,
    key: 'monitor',
    icon: ChartIcon,
    label: 'Monitor',
    children: [
      { to: '/monitor',  label: 'Monitoring' },
      { to: '/network',  label: 'Network' },
      { to: '/logs',     label: 'Logs & Audits' },
    ],
  },
  {
    section: 'Governance',
    expandable: true,
    key: 'gov',
    icon: ShieldIcon,
    label: 'Governance',
    children: [
      { to: '/compliance',  label: 'Compliance' },
      { to: '/diagnostics', label: 'Diagnostics' },
      { to: '/reports',     label: 'Reports' },
    ],
  },
];

const STANDALONE = [
  { to: '/backup', label: 'Backup & Recovery', icon: BackupIcon, badge: '6', bc: 'g' },
  { to: '/alerts', label: 'Alerts',            icon: BellIcon,   badge: '7', bc: 'r' },
  { to: '/settings', label: 'Settings',        icon: GearIcon },
];

const badgeCls = { g: 'bg-accent/10 text-accent', r: 'bg-red/10 text-red', a: 'bg-amber/10 text-amber' };

export default function Sidebar() {
  const location = useLocation();
  const [open, setOpen] = useState({ manage: true, monitor: false, gov: false });

  const toggle = (key) => setOpen(p => ({ ...p, [key]: !p[key] }));
  const isChildActive = (children) => children.some(c => location.pathname === c.to);

  return (
    <div className="flex flex-col flex-shrink-0 border-r" style={{ width: 218, background: '#0f1010', borderColor: 'rgba(255,255,255,0.055)' }}>

      {/* Logo */}
      <div className="flex items-center gap-[10px] px-[16px] py-[18px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
        <motion.div
          className="flex items-center justify-center rounded-[8px] font-extrabold flex-shrink-0"
          style={{ width: 30, height: 30, background: '#17c97c', fontSize: 12, color: '#051a0e', letterSpacing: '-0.05em' }}
          whileHover={{ scale: 1.08 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        >U</motion.div>
        <div>
          <div className="font-bold tracking-[-0.02em]" style={{ fontSize: 13 }}>USAP</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>SysAdmin Platform</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-[8px] px-[10px]" style={{ scrollbarWidth: 'none' }}>

        {/* Dashboard home — big pill like IQON */}
        <NavLink to="/" style={{ textDecoration: 'none' }}>
          {({ isActive }) => (
            <motion.div
              className="nav-home mb-[14px]"
              style={{ background: isActive ? 'rgba(23,201,124,0.12)' : 'rgba(255,255,255,0.03)', borderColor: isActive ? 'rgba(23,201,124,0.18)' : 'rgba(255,255,255,0.055)' }}
              whileHover={{ background: isActive ? 'rgba(23,201,124,0.16)' : 'rgba(255,255,255,0.06)' }}
            >
              <HomeIcon color={isActive ? '#17c97c' : 'rgba(255,255,255,0.45)'} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: isActive ? '#17c97c' : 'rgba(255,255,255,0.65)' }}>Dashboard</span>
            </motion.div>
          )}
        </NavLink>

        {/* Inventory standalone */}
        <div className="sec-label">Overview</div>
        {NAV[0].items.map(item => (
          <StandaloneItem key={item.to} item={item} location={location} />
        ))}

        {/* Expandable groups */}
        {NAV.slice(1).map(group => (
          <div key={group.key}>
            <div className="sec-label mt-[10px]">{group.section}</div>
            <motion.div
              className="nav-parent"
              onClick={() => toggle(group.key)}
              style={{ color: (open[group.key] || isChildActive(group.children)) ? 'rgba(255,255,255,0.82)' : undefined }}
              whileHover={{ paddingLeft: 13 }}
              transition={{ duration: 0.14 }}
            >
              <div className="flex items-center gap-[8px]">
                <group.icon color="currentColor" />
                <span>{group.label}</span>
              </div>
              <motion.span
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}
                animate={{ rotate: open[group.key] ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >▾</motion.span>
            </motion.div>
            <AnimatePresence>
              {open[group.key] && (
                <motion.div
                  className="nav-children"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {group.children.map(child => (
                    <NavLink key={child.to} to={child.to} style={{ textDecoration: 'none' }}>
                      {({ isActive }) => (
                        <div className={`nav-child ${isActive ? 'active' : ''}`}>
                          <span className="flex-1">{child.label}</span>
                          {child.badge && (
                            <span className={`text-[9px] font-bold px-[5px] py-[1px] rounded-full ${badgeCls[child.bc]}`}>{child.badge}</span>
                          )}
                        </div>
                      )}
                    </NavLink>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {/* Standalone bottom items */}
        <div className="sec-label mt-[10px]">Quick access</div>
        {STANDALONE.map(item => (
          <StandaloneItem key={item.to} item={item} location={location} />
        ))}
      </div>

      {/* Bottom — Theme + Need help like IQON */}
      <div className="px-[10px] pb-[12px] pt-[10px]" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Theme picker */}
        <div className="flex items-center justify-between px-[10px] py-[8px] rounded-[7px] mb-[8px] cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.055)' }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Theme</div>
            <div className="flex items-center gap-[5px]" style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#17c97c' }} />
              Neo's Noir
            </div>
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>▾</span>
        </div>

        {/* Need help card — exactly like IQON */}
        <div className="rounded-[9px] p-[12px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="font-bold mb-[2px]" style={{ fontSize: 13 }}>Need help?</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.33)', marginBottom: 10 }}>24/7 assistance available</div>
          <button className="btn-accent w-full" style={{ fontSize: 11.5, padding: '7px 12px' }}>
            Talk to a professional
          </button>
        </div>

        {/* User */}
        <motion.div
          className="flex items-center gap-[8px] px-[8px] py-[8px] rounded-[7px] mt-[8px] cursor-pointer"
          whileHover={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center justify-center rounded-full flex-shrink-0 font-bold"
            style={{ width: 27, height: 27, background: 'rgba(77,155,255,0.14)', border: '1px solid rgba(77,155,255,0.22)', fontSize: 9.5, color: '#4d9bff' }}>
            VS
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, fontWeight: 500, color: '#efefed' }}>Vedant Shinde</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>Super Admin</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function StandaloneItem({ item, location }) {
  const active = location.pathname === item.to;
  return (
    <NavLink to={item.to} style={{ textDecoration: 'none' }}>
      <motion.div
        className="nav-parent"
        style={{ color: active ? '#efefed' : undefined, background: active ? 'rgba(255,255,255,0.05)' : undefined }}
        whileHover={{ paddingLeft: 13 }}
        transition={{ duration: 0.13 }}
      >
        <div className="flex items-center gap-[8px]">
          {item.icon && <item.icon color={active ? '#efefed' : 'currentColor'} />}
          <span style={{ fontWeight: active ? 500 : 400 }}>{item.label}</span>
        </div>
        {item.badge && (
          <span className={`text-[9px] font-bold px-[5.5px] py-[1.5px] rounded-full ${badgeCls[item.bc]}`}>{item.badge}</span>
        )}
      </motion.div>
    </NavLink>
  );
}

// Icons
const ic = (color) => ({ width: 14, height: 14, stroke: color || 'currentColor', strokeWidth: 2, fill: 'none' });
function HomeIcon({ color })   { return <svg {...ic(color)} viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function ServerIcon({ color }) { return <svg {...ic(color)} viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> }
function WrenchIcon({ color }) { return <svg {...ic(color)} viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> }
function ChartIcon({ color })  { return <svg {...ic(color)} viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-4"/></svg> }
function ShieldIcon({ color }) { return <svg {...ic(color)} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function BackupIcon({ color }) { return <svg {...ic(color)} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> }
function BellIcon({ color })   { return <svg {...ic(color)} viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
function GearIcon({ color })   { return <svg {...ic(color)} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
