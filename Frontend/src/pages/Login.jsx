// src/pages/Login.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0c0c0d', fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        style={{
          width: 320, padding: 28, borderRadius: 12,
          background: '#141416', border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#efefed', marginBottom: 4 }}>
          USAP
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
          Sign in to continue
        </div>

        <input
          placeholder="Email" type="email" value={email} autoComplete="username"
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Password" type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && signIn()}
          style={inputStyle}
        />

        <motion.button
          onClick={signIn}
          disabled={busy || !email || !password}
          whileTap={{ scale: 0.98 }}
          style={{
            width: '100%', height: 36, borderRadius: 8, border: 'none',
            background: '#17c97c', color: '#051a0e', fontWeight: 700, fontSize: 12.5,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, marginTop: 4,
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </motion.button>

        {err && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#e05555' }}>{err}</div>
        )}
      </motion.div>
    </div>
  );
}

const inputStyle = {
  display: 'block', width: '100%', height: 34, marginBottom: 10, padding: '0 10px',
  borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a1d',
  color: '#efefed', fontSize: 12.5, boxSizing: 'border-box', outline: 'none',
};