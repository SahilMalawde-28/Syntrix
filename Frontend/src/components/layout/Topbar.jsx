// src/components/layout/Topbar.jsx

import React, { useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../../api/client';

const META = {
  '/': {
    title: 'Dashboard',
    sub: 'Infrastructure overview',
  },
  '/inventory': {
    title: 'Inventory',
    sub: 'All managed nodes',
  },
  '/users': {
    title: 'Users & Access',
    sub: 'Identity management',
  },
  '/software': {
    title: 'Software',
    sub: 'Install, remove, audit',
  },
  '/config': {
    title: 'Configuration',
    sub: 'DNS, hostname, env vars',
  },
  '/patches': {
    title: 'Patches',
    sub: 'Security patch management',
  },
  '/services': {
    title: 'Services',
    sub: 'Daemon management',
  },
  '/provision': {
    title: 'Provisioning',
    sub: 'Golden config deployment',
  },
  '/monitor': {
    title: 'Monitoring',
    sub: 'Real-time metrics',
  },
  '/network': {
    title: 'Network',
    sub: 'Connectivity diagnostics',
  },
  '/logs': {
    title: 'Logs & Audits',
    sub: 'Centralized log collection',
  },
  '/backup': {
    title: 'Backup & Recovery',
    sub: 'Backup job management',
  },
  '/alerts': {
    title: 'Alerts',
    sub: 'System incidents',
  },
  '/compliance': {
    title: 'Compliance',
    sub: 'Policy enforcement',
  },
  '/diagnostics': {
    title: 'Diagnostics',
    sub: 'Fleet diagnostics',
  },
  '/reports': {
    title: 'Reports',
    sub: 'Generated reports',
  },
  '/settings': {
    title: 'Settings',
    sub: 'App configuration',
  },
};

const isElectron =
  typeof window !== 'undefined' &&
  !!window.electronAPI;

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();

  const meta =
    META[location.pathname] || {
      title: 'Syntrix',
      sub: '',
    };

  const [profile, setProfile] = useState({
    name: 'Loading...',
    role: '',
    initials: '...',
  });

  const [alerts, setAlerts] =
    useState(null);

  const [cloudStatus, setCloudStatus] =
    useState('checking');

  const [search, setSearch] =
    useState('');

  useEffect(() => {
    loadTopbarData();
  }, []);

  async function loadTopbarData() {
    try {
      setCloudStatus('checking');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setCloudStatus('offline');

        setProfile({
          name: 'Not signed in',
          role: '',
          initials: '?',
        });

        return;
      }

      // ---------------------------------------------------------
      // PROFILE
      // ---------------------------------------------------------

      const {
        data: profileData,
      } = await supabase
        .from('profiles')
        .select(
          'full_name, username, email, role'
        )
        .eq('id', user.id)
        .maybeSingle();

      const name =
        profileData?.full_name ||
        profileData?.username ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'User';

      const role =
        profileData?.role ||
        user.user_metadata?.role ||
        'User';

      setProfile({
        name,
        role: formatRole(role),
        initials: getInitials(name),
      });

      // ---------------------------------------------------------
      // CHECK SUPABASE
      // ---------------------------------------------------------

      const { error: dbError } =
        await supabase
          .from('devices')
          .select('hostname')
          .limit(1);

      if (dbError) {
        setCloudStatus('offline');
      } else {
        setCloudStatus('online');
      }

      // ---------------------------------------------------------
      // REAL ALERT COUNT
      // ---------------------------------------------------------

      const { count } =
        await supabase
          .from('jobs')
          .select('*', {
            count: 'exact',
            head: true,
          })
          .eq('status', 'failed');

      setAlerts(count ?? 0);

    } catch (error) {
      console.error(
        '[Topbar] Failed to load:',
        error
      );

      setCloudStatus('offline');
    }
  }

  function handleRefresh() {
    window.location.reload();
  }

  function handleSearchKeyDown(event) {
    if (event.key !== 'Enter') return;

    const query =
      search.trim().toLowerCase();

    if (!query) return;

    // Simple navigation shortcuts.
    if (query.includes('inventory')) {
      navigate('/inventory');
    } else if (query.includes('user')) {
      navigate('/users');
    } else if (query.includes('software')) {
      navigate('/software');
    } else if (query.includes('patch')) {
      navigate('/patches');
    } else if (query.includes('monitor')) {
      navigate('/monitor');
    } else if (query.includes('network')) {
      navigate('/network');
    } else if (query.includes('log')) {
      navigate('/logs');
    } else if (query.includes('alert')) {
      navigate('/alerts');
    } else if (query.includes('backup')) {
      navigate('/backup');
    } else if (query.includes('setting')) {
      navigate('/settings');
    }

    setSearch('');
  }

  const cloudColor =
    cloudStatus === 'online'
      ? '#17c97c'
      : cloudStatus === 'offline'
        ? '#e05555'
        : '#f0a020';

  const cloudLabel =
    cloudStatus === 'online'
      ? 'Connected'
      : cloudStatus === 'offline'
        ? 'Offline'
        : 'Checking';

  return (
    <div
      className="flex items-center gap-[12px] flex-shrink-0 px-[20px]"
      style={{
        height: 52,
        background: '#0f1010',
        borderBottom:
          '1px solid rgba(255,255,255,0.055)',
        WebkitAppRegion: 'drag',
      }}
    >

      {/* Page title */}

      <div
        style={{
          WebkitAppRegion: 'no-drag',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            color: '#efefed',
          }}
        >
          {meta.title}
        </span>

        {meta.sub && (
          <span
            style={{
              fontSize: 11,
              color:
                'rgba(255,255,255,0.28)',
              marginLeft: 8,
            }}
          >
            · {meta.sub}
          </span>
        )}
      </div>

      {/* Right side */}

      <div
        className="flex items-center gap-[8px] ml-auto"
        style={{
          WebkitAppRegion: 'no-drag',
        }}
      >

        {/* Search */}

        <div
          className="flex items-center gap-[7px] rounded-[7px] px-[10px]"
          style={{
            width: 172,
            height: 30,
            background:
              'rgba(255,255,255,0.04)',
            border:
              '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="2"
          >
            <circle
              cx="11"
              cy="11"
              r="8"
            />
            <path d="m21 21-4.35-4.35" />
          </svg>

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            onKeyDown={handleSearchKeyDown}
            placeholder="Search nodes…"
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#efefed',
              fontSize: 11.5,
            }}
          />
        </div>

        {/* Refresh */}

        <motion.button
          title="Refresh"
          onClick={handleRefresh}
          className="flex items-center justify-center rounded-[7px] relative cursor-pointer"
          style={{
            width: 30,
            height: 30,
            background:
              'rgba(255,255,255,0.04)',
            border:
              '1px solid rgba(255,255,255,0.07)',
            color:
              'rgba(255,255,255,0.45)',
          }}
          whileHover={{
            background:
              'rgba(255,255,255,0.08)',
            color: '#efefed',
            borderColor:
              'rgba(255,255,255,0.12)',
          }}
        >
          <RefreshIco />
        </motion.button>

        {/* Alerts */}

        <motion.button
          title={
            alerts === null
              ? 'Alerts'
              : `${alerts} failed jobs`
          }
          onClick={() =>
            navigate('/alerts')
          }
          className="flex items-center justify-center rounded-[7px] relative cursor-pointer"
          style={{
            width: 30,
            height: 30,
            background:
              'rgba(255,255,255,0.04)',
            border:
              '1px solid rgba(255,255,255,0.07)',
            color:
              'rgba(255,255,255,0.45)',
          }}
          whileHover={{
            background:
              'rgba(255,255,255,0.08)',
            color: '#efefed',
            borderColor:
              'rgba(255,255,255,0.12)',
          }}
        >
          <BellIco />

          {alerts !== null &&
            alerts > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  minWidth: 5,
                  height: 5,
                  padding:
                    alerts > 9
                      ? '0 2px'
                      : 0,
                  background: '#e05555',
                  borderRadius: 99,
                  border:
                    '1.5px solid #0f1010',
                }}
              />
            )}
        </motion.button>

        {/* Settings */}

        <motion.button
          title="Settings"
          onClick={() =>
            navigate('/settings')
          }
          className="flex items-center justify-center rounded-[7px] relative cursor-pointer"
          style={{
            width: 30,
            height: 30,
            background:
              'rgba(255,255,255,0.04)',
            border:
              '1px solid rgba(255,255,255,0.07)',
            color:
              'rgba(255,255,255,0.45)',
          }}
          whileHover={{
            background:
              'rgba(255,255,255,0.08)',
            color: '#efefed',
            borderColor:
              'rgba(255,255,255,0.12)',
          }}
        >
          <SettingsIco />
        </motion.button>

        {/* REAL CLOUD STATUS */}

        <div
          className="flex items-center gap-[5px] rounded-[6px] px-[9px]"
          style={{
            height: 30,
            background:
              'rgba(255,255,255,0.03)',
            border:
              '1px solid rgba(255,255,255,0.07)',
            fontSize: 10.5,
            color:
              'rgba(255,255,255,0.38)',
          }}
        >
          <motion.div
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: cloudColor,
            }}
            animate={{
              opacity:
                cloudStatus === 'online'
                  ? [1, 0.35, 1]
                  : 1,
            }}
            transition={{
              duration: 2.2,
              repeat:
                cloudStatus === 'online'
                  ? Infinity
                  : 0,
            }}
          />

          {cloudLabel}
        </div>

        {/* REAL USER */}

        <div
          title={`${profile.name}${
            profile.role
              ? ` — ${profile.role}`
              : ''
          }`}
          className="flex items-center justify-center rounded-full font-bold cursor-pointer"
          style={{
            width: 30,
            height: 30,
            background:
              'rgba(77,155,255,0.14)',
            border:
              '1px solid rgba(77,155,255,0.22)',
            fontSize: 9.5,
            color: '#4d9bff',
            marginLeft: 2,
          }}
        >
          {profile.initials}
        </div>

        {/* Electron controls */}

        {isElectron && (
          <div className="flex gap-[5px] ml-[4px]">
            {[
              {
                label: '—',
                fn: () =>
                  window.electronAPI?.minimize(),
                color: '#f0a020',
              },
              {
                label: '⤢',
                fn: () =>
                  window.electronAPI?.maximize(),
                color: '#17c97c',
              },
              {
                label: '✕',
                fn: () =>
                  window.electronAPI?.close(),
                color: '#e05555',
              },
            ].map(
              ({
                label,
                fn,
                color,
              }) => (
                <motion.button
                  key={label}
                  onClick={fn}
                  className="flex items-center justify-center rounded-[6px] cursor-pointer"
                  style={{
                    width: 27,
                    height: 27,
                    background:
                      'rgba(255,255,255,0.04)',
                    border:
                      '1px solid rgba(255,255,255,0.07)',
                    color,
                    fontSize: 11,
                  }}
                  whileHover={{
                    background:
                      'rgba(255,255,255,0.09)',
                  }}
                >
                  {label}
                </motion.button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getInitials(name) {
  if (!name) return '?';

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

function formatRole(role) {
  if (!role) return 'User';

  return role
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) =>
      c.toUpperCase()
    );
}

const is = {
  width: 13,
  height: 13,
  stroke: 'currentColor',
  strokeWidth: 2,
  fill: 'none',
};

function RefreshIco() {
  return (
    <svg {...is} viewBox="0 0 24 24">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function BellIco() {
  return (
    <svg {...is} viewBox="0 0 24 24">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SettingsIco() {
  return (
    <svg {...is} viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="3"
      />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}