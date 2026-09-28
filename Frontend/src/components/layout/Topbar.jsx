// src/components/layout/Topbar.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

const META = {
  '/':           { title: 'Dashboard',         sub: 'Infrastructure overview' },
  '/inventory':  { title: 'Inventory',          sub: 'All managed nodes' },
  '/users':      { title: 'Users & Access',     sub: 'Identity management' },
  '/software':   { title: 'Software',           sub: 'Install, remove, audit' },
  '/config':     { title: 'Configuration',      sub: 'DNS, hostname, env vars' },
  '/patches':    { title: 'Patches',            sub: 'Security patch management' },
  '/services':   { title: 'Services',           sub: 'Daemon management' },
  '/provision':  { title: 'Provisioning',       sub: 'Golden config deployment' },
  '/monitor':    { title: 'Monitoring',         sub: 'Real-time metrics' },
  '/network':    { title: 'Network',            sub: 'Connectivity diagnostics' },
  '/logs':       { title: 'Logs & Audits',      sub: 'Centralized log collection' },
  '/backup':     { title: 'Backup & Recovery',  sub: 'Domain 8 — fully wired' },
  '/alerts':     { title: 'Alerts',             sub: 'Active incidents' },
  '/compliance': { title: 'Compliance',         sub: 'Policy enforcement' },
  '/diagnostics':{ title: 'Diagnostics',        sub: 'Fleet diagnostics' },
  '/reports':    { title: 'Reports',            sub: 'Generated reports' },
  '/settings':   { title: 'Settings',           sub: 'App configuration' },
};

const isElectron = !!window.electronAPI;

export default function Topbar() {
  const location = useLocation();
  const meta = META[location.pathname] || { title: 'USAP', sub: '' };

  return (
    <div
      className="flex items-center gap-[12px] flex-shrink-0 px-[20px]"
      style={{ height: 52, background: '#0f1010', borderBottom: '1px solid rgba(255,255,255,0.055)', WebkitAppRegion: 'drag' }}
    >
      {/* Page title */}
      <div style={{ WebkitAppRegion: 'no-drag' }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.025em', color: '#efefed' }}>{meta.title}</span>
        {meta.sub && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginLeft: 8 }}>· {meta.sub}</span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-[8px] ml-auto" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Search */}
        <motion.div
          className="flex items-center gap-[7px] rounded-[7px] cursor-text px-[10px]"
          style={{ width: 172, height: 30, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          whileHover={{ borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.28)' }}>Search nodes…</span>
        </motion.div>

        {/* Icon buttons */}
        {[
          { title: 'Refresh', icon: <RefreshIco/> },
          { title: 'Alerts', icon: <BellIco/>, pip: true },
          { title: 'Settings', icon: <SettingsIco/> },
        ].map(({ title, icon, pip }) => (
          <motion.button
            key={title}
            title={title}
            className="flex items-center justify-center rounded-[7px] relative cursor-pointer"
            style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }}
            whileHover={{ background: 'rgba(255,255,255,0.08)', color: '#efefed', borderColor: 'rgba(255,255,255,0.12)' }}
            transition={{ duration: 0.12 }}
          >
            {icon}
            {pip && <div style={{ position: 'absolute', top: 6, right: 6, width: 4.5, height: 4.5, background: '#e05555', borderRadius: '50%', border: '1.5px solid #0f1010' }} />}
          </motion.button>
        ))}

        {/* Cloud connection status */}
        <div className="flex items-center gap-[5px] rounded-[6px] px-[9px]"
          style={{ height: 30, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 10.5, color: 'rgba(255,255,255,0.38)' }}>
          <motion.div
            style={{ width: 5, height: 5, borderRadius: '50%', background: '#17c97c' }}
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          Cloud
        </div>

        {/* Avatar */}
        <div className="flex items-center justify-center rounded-full font-bold cursor-pointer"
          style={{ width: 30, height: 30, background: 'rgba(77,155,255,0.14)', border: '1px solid rgba(77,155,255,0.22)', fontSize: 9.5, color: '#4d9bff', marginLeft: 2 }}>
          VS
        </div>

        {/* Window controls — Electron only */}
        {isElectron && (
          <div className="flex gap-[5px] ml-[4px]">
            {[
              { label: '—', fn: () => window.electronAPI?.minimize(), color: '#f0a020' },
              { label: '⤢', fn: () => window.electronAPI?.maximize(), color: '#17c97c' },
              { label: '✕', fn: () => window.electronAPI?.close(),    color: '#e05555' },
            ].map(({ label, fn, color }) => (
              <motion.button
                key={label}
                onClick={fn}
                className="flex items-center justify-center rounded-[6px] cursor-pointer"
                style={{ width: 27, height: 27, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color, fontSize: 11 }}
                whileHover={{ background: 'rgba(255,255,255,0.09)' }}
              >
                {label}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const is = { width: 13, height: 13, stroke: 'currentColor', strokeWidth: 2, fill: 'none' };
function RefreshIco()  { return <svg {...is} viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> }
function BellIco()     { return <svg {...is} viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
function SettingsIco() { return <svg {...is} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> }
