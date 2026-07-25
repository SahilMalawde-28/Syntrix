// src/components/ui/GaugeRing.jsx
import React, { useEffect, useRef } from 'react';

function polarToXY(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export default function GaugeRing({ value = 0, size = 74, strokeWidth = 5, color = '#17c97c', label, sublabel, delay = 0 }) {
  const fillRef = useRef(null);
  const cx = size / 2, cy = size / 2;
  const r  = (size - strokeWidth) / 2;
  const START = -210, TOTAL = 240;
  const trackPath = describeArc(cx, cy, r, START, START + TOTAL);

  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      const dur = 1400;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        const endDeg = START + e * value * (TOTAL / 100);
        if (e * value > 0.5) {
          el.setAttribute('d', describeArc(cx, cy, r, START, endDeg));
          el.style.opacity = '1';
        }
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay, cx, cy, r]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        {/* Track */}
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} strokeLinecap="round" />
        {/* Animated fill */}
        <path
          ref={fillRef}
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity="0"
          style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}
        />
      </svg>
      {/* Center label */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 4 }}>
        {label && <div style={{ fontSize: size * 0.22, fontWeight: 700, color, letterSpacing: '-0.04em', lineHeight: 1 }}>{label}</div>}
        {sublabel && <div style={{ fontSize: size * 0.125, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{sublabel}</div>}
      </div>
    </div>
  );
}
