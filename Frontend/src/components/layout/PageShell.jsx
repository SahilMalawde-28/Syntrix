// src/components/layout/PageShell.jsx

import React, {
  useEffect,
  useState,
} from 'react';

import { motion } from 'framer-motion';
import { MeshTexture } from '../ui';
import { supabase } from '../../api/client';

const ctr = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itm = {
  hidden: {
    opacity: 0,
    y: 8,
  },

  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.26,
      ease: 'easeOut',
    },
  },
};

export default function PageShell({
  title,
  domain,
  icon: Icon,
  color = '#4d9bff',
  description,
  children,
}) {
  const [stats, setStats] =
    useState({
      total: null,
      completed: null,
      running: null,
      pending: null,
      failed: null,
    });

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    loadDomainStats();
  }, [domain]);

  async function loadDomainStats() {
    if (!domain) return;

    setLoading(true);

    try {
      const normalizedDomain =
        normalizeDomain(domain);

      const {
        count: total,
      } = await supabase
        .from('jobs')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq(
          'domain',
          normalizedDomain
        );

      const {
        count: completed,
      } = await supabase
        .from('jobs')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq(
          'domain',
          normalizedDomain
        )
        .eq(
          'status',
          'completed'
        );

      const {
        count: running,
      } = await supabase
        .from('jobs')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq(
          'domain',
          normalizedDomain
        )
        .eq(
          'status',
          'running'
        );

      const {
        count: pending,
      } = await supabase
        .from('jobs')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq(
          'domain',
          normalizedDomain
        )
        .eq(
          'status',
          'pending'
        );

      const {
        count: failed,
      } = await supabase
        .from('jobs')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq(
          'domain',
          normalizedDomain
        )
        .eq(
          'status',
          'failed'
        );

      setStats({
        total: total ?? 0,
        completed: completed ?? 0,
        running: running ?? 0,
        pending: pending ?? 0,
        failed: failed ?? 0,
      });

    } catch (error) {
      console.error(
        '[PageShell] Failed to load domain stats:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      className="page-enter flex-1 overflow-y-auto"
      style={{
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
      variants={ctr}
      initial="hidden"
      animate="show"
    >

      {/* -------------------------------------------------------
          DOMAIN HEADER
      ------------------------------------------------------- */}

      <motion.div
        variants={itm}
        className="card"
        style={{
          borderLeft:
            `2.5px solid ${color}`,
        }}
      >
        <MeshTexture
          color={color}
          cx="90%"
          cy="40%"
          opacity={0.07}
        />

        <div
          className="card-body"
          style={{
            padding: '18px 22px',
          }}
        >
          <div className="flex items-center gap-[12px]">

            {Icon && (
              <div
                className="flex items-center justify-center rounded-[10px] flex-shrink-0"
                style={{
                  width: 40,
                  height: 40,
                  background:
                    `${color}15`,
                }}
              >
                <Icon
                  color={color}
                  size={18}
                />
              </div>
            )}

            <div className="flex-1">
              <div
                className="flex items-center gap-[9px] mb-[3px]"
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing:
                      '-0.025em',
                    color: '#efefed',
                  }}
                >
                  {title}
                </span>

                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 99,
                    background:
                      `${color}15`,
                    color,
                  }}
                >
                  {domain}
                </span>
              </div>

              <div
                style={{
                  fontSize: 11.5,
                  color:
                    'rgba(255,255,255,0.35)',
                }}
              >
                {description}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* -------------------------------------------------------
          REAL DOMAIN STATS
      ------------------------------------------------------- */}

      {/* <motion.div
        variants={itm}
        className="card"
        style={{
          padding: '16px 18px',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#efefed',
            marginBottom: 12,
          }}
        >
          {title} activity
        </div>

        <div
          className="grid grid-cols-5 gap-[8px]"
        >
          <Stat
            label="Total"
            value={stats.total}
            color={color}
            loading={loading}
          />

          <Stat
            label="Completed"
            value={stats.completed}
            color="#17c97c"
            loading={loading}
          />

          <Stat
            label="Running"
            value={stats.running}
            color="#4d9bff"
            loading={loading}
          />

          <Stat
            label="Pending"
            value={stats.pending}
            color="#f0a020"
            loading={loading}
          />

          <Stat
            label="Failed"
            value={stats.failed}
            color="#e05555"
            loading={loading}
          />
        </div>
      </motion.div> */}

      {/* -------------------------------------------------------
          ACTUAL PAGE CONTENT
      ------------------------------------------------------- */}

      {children || (
        <DomainEmptyState
          title={title}
          domain={domain}
          color={color}
          stats={stats}
          loading={loading}
        />
      )}
    </motion.div>
  );
}

function Stat({
  label,
  value,
  color,
  loading,
}) {
  return (
    <div
      style={{
        padding: '12px 13px',
        borderRadius: 8,
        background:
          'rgba(255,255,255,0.025)',
        border:
          '1px solid rgba(255,255,255,0.055)',
      }}
    >
      <div
        style={{
          fontSize: 9,
          color:
            'rgba(255,255,255,0.3)',
          marginBottom: 5,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 19,
          fontWeight: 700,
          color,
          letterSpacing: '-0.03em',
        }}
      >
        {loading
          ? '…'
          : value ?? 0}
      </div>
    </div>
  );
}

function DomainEmptyState({
  title,
  domain,
  color,
  stats,
  loading,
}) {
  return (
    <motion.div
      variants={itm}
      className="card"
      style={{
        padding: '38px 20px',
        textAlign: 'center',
      }}
    >
      <MeshTexture
        color={color}
        cx="50%"
        cy="40%"
        opacity={0.06}
      />

      <motion.div
        className="flex items-center justify-center rounded-full mb-[18px]"
        style={{
          width: 60,
          height: 60,
          margin: '0 auto',
          background: `${color}10`,
          border:
            `1.5px solid ${color}22`,
          position: 'relative',
          zIndex: 1,
        }}
        animate={{
          scale: [1, 1.04, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <span style={{ fontSize: 24 }}>
          ◈
        </span>
      </motion.div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#efefed',
          marginBottom: 7,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 11.5,
          color:
            'rgba(255,255,255,0.32)',
          maxWidth: 460,
          margin: '0 auto',
          lineHeight: 1.7,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {loading
          ? 'Loading live job information…'
          : stats.total === 0
            ? `No ${domain} jobs have been recorded yet.`
            : `${stats.total} ${domain} job${
                stats.total === 1
                  ? ''
                  : 's'
              } recorded in Syntrix.`}
      </div>
    </motion.div>
  );
}

function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}