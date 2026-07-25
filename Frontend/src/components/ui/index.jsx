// src/components/ui/index.jsx
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Mesh SVG texture — IQON-style dot grid with radial glow ────────────── */
export function MeshTexture({ color = '#17c97c', cx = '80%', cy = '40%', opacity = 0.07 }) {
  const id = `mg_${color.replace('#','')}${Math.random().toString(36).slice(2,6)}`;
  const dots = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 12; col++) {
      dots.push({ x: 140 + col * 20, y: 12 + row * 18 });
    }
  }
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, borderRadius: 'inherit' }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={id} cx={cx} cy={cy} r="60%">
          <stop offset="0%" stopColor={color} stopOpacity="0.09" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      <g fill={color} opacity={opacity}>
        {dots.map((d, i) => <circle key={i} r="1.1" cx={d.x} cy={d.y} />)}
      </g>
    </svg>
  );
}

/* ── Status Dot ─────────────────────────────────────────────────────────── */
export function StatusDot({ status = 'online', size = 6 }) {
  const map = {
    online:  { cls: 'sdot-g', animate: true },
    warn:    { cls: 'sdot-y', animate: false },
    error:   { cls: 'sdot-r', animate: false },
    off:     { cls: 'sdot-n', animate: false },
  };
  const s = map[status] || map.off;
  return (
    <motion.div
      className={`sdot ${s.cls}`}
      style={{ width: size, height: size }}
      animate={s.animate ? { opacity: [1, 0.4, 1], scale: [1, 0.8, 1] } : {}}
      transition={s.animate ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } : {}}
    />
  );
}

/* ── Chip ───────────────────────────────────────────────────────────────── */
export function Chip({ children, variant = 'ok' }) {
  return <span className={`chip chip-${variant}`}>{children}</span>;
}

/* ── Animated progress bar ──────────────────────────────────────────────── */
export function ProgressBar({ value = 0, color, delay = 0, height = 3.5 }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), delay + 100);
    return () => clearTimeout(t);
  }, [value, delay]);
  const auto = value > 80 ? '#e05555' : value > 60 ? '#f0a020' : '#17c97c';
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${width}%`, background: color || auto, borderRadius: 99, transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)' }} />
    </div>
  );
}

/* ── CountUp number ─────────────────────────────────────────────────────── */
export function CountUp({ value, className = '', style = {}, delay = 0 }) {
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const dur = 1300, start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        setDisp(Math.round(e * value));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return <span className={className} style={style}>{disp}</span>;
}

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({ children, className = '', hover = true, style = {}, onClick }) {
  return (
    <motion.div
      className={`card ${className}`}
      style={style}
      onClick={onClick}
      whileHover={hover ? { y: -2, borderColor: 'rgba(255,255,255,0.105)' } : {}}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      {children}
    </motion.div>
  );
}

/* ── Card Header ────────────────────────────────────────────────────────── */
export function CardHeader({ title, action, actionLabel = 'View all →' }) {
  return (
    <div className="flex items-center justify-between mb-[12px]">
      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.015em', color: '#efefed' }}>{title}</span>
      {action && (
        <button onClick={action} style={{ fontSize: 11, color: '#17c97c', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.8 }}
          onMouseEnter={e => e.target.style.opacity = 1}
          onMouseLeave={e => e.target.style.opacity = 0.8}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ── Terminal Output ────────────────────────────────────────────────────── */
export function TerminalOutput({ lines = [], height = 280, title = 'Output' }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  function cls(line) {
    if (!line) return 't-dim';
    if (/FAILED|fatal|ERROR/.test(line)) return 't-err';
    if (/ok:|SUCCESS|changed:|✅/.test(line)) return 't-ok';
    if (/WARNING|DEPRECATION|skipping|⚠/.test(line)) return 't-warn';
    if (/^PLAY|^TASK|RECAP/.test(line)) return 't-info';
    return 'text-[rgba(255,255,255,0.55)]';
  }

  return (
    <div className="terminal-wrap">
      <div className="terminal-bar">
        {['#e05555','#f0a020','#17c97c'].map(c => (
          <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.75 }} />
        ))}
        <span style={{ marginLeft: 8, fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontFamily: 'JetBrains Mono, monospace' }}>{title}</span>
      </div>
      <div className="terminal-body" style={{ height }}>
        {lines.length === 0
          ? <span className="t-dim">Waiting for output…</span>
          : lines.map((line, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.08 }} className={cls(line)}>
                {line || '\u00a0'}
              </motion.div>
            ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ── Input ──────────────────────────────────────────────────────────────── */
export function Input({ label, ...props }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'rgba(255,255,255,0.38)', marginBottom: 5 }}>{label}</label>}
      <input className="inp" {...props} />
    </div>
  );
}

/* ── Select ─────────────────────────────────────────────────────────────── */
export function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'rgba(255,255,255,0.38)', marginBottom: 5 }}>{label}</label>}
      <select className="inp" style={{ cursor: 'pointer', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%234a4a47' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', appearance: 'none' }} {...props}>
        {children}
      </select>
    </div>
  );
}

/* ── Spinner ────────────────────────────────────────────────────────────── */
export function Spinner({ size = 15, color = '#17c97c' }) {
  return (
    <motion.div
      style={{ width: size, height: size, borderRadius: '50%', border: `2px solid rgba(255,255,255,0.08)`, borderTopColor: color, flexShrink: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ── Toggle ─────────────────────────────────────────────────────────────── */
export function Toggle({ on, onChange }) {
  return (
    <div
      className={`toggle-track ${on ? 'toggle-on' : 'toggle-off'}`}
      onClick={() => onChange && onChange(!on)}
    >
      <motion.div
        className="toggle-thumb"
        animate={{ left: on ? 19 : 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        style={{ position: 'absolute', top: 3 }}
      />
    </div>
  );
}
