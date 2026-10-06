// src/pages/Dashboard.jsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CardHeader, StatusDot, CountUp, ProgressBar, MeshTexture } from '../components/ui';
import GaugeRing from '../components/ui/GaugeRing';
import { supabase } from '../api/client'; // Import your Supabase client directly

let telemetryCache = {
  nodes: [],
  jobs: [],
  lastSynced: null,
};

const ctr = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
};

const itm = {
  hidden: { opacity: 0, y: 7 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const isFetchingRef = useRef(false);

  const [nodes, setNodes] = useState(telemetryCache.nodes);
  const [jobs, setJobs] = useState(telemetryCache.jobs);
  const [lastSynced, setLastSynced] = useState(telemetryCache.lastSynced);
  const [loading, setLoading] = useState(telemetryCache.nodes.length === 0);

  const fetchDashboardData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      // 1. Fetch devices directly from Supabase using exact schema column names
      const { data: devicesData, error: devicesError } = await supabase
        .from('devices')
        .select('id, hostname, ip_address, is_online, cpu_percent, ram_percent, disk_percent, os_type, last_seen');

      let combinedNodes = [];
      if (!devicesError && devicesData) {
        combinedNodes = devicesData.map((dev) => ({
          id: dev.id,
          name: dev.hostname || 'Unknown',
          ip: dev.ip_address || 'N/A',
          status: dev.is_online ? 'online' : 'off',
          cpu: Number(dev.cpu_percent) || 0,
          ram: Number(dev.ram_percent) || 0,
          disk: Number(dev.disk_percent) || 0,
          os: dev.os_type || 'linux',
          lastSeen: dev.last_seen
        }));
      }

      // 2. Fetch recent executions directly from the jobs table
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);

      let fetchedJobs = [];
      if (!jobsError && jobsData) {
        fetchedJobs = jobsData;
      }

      const syncTime = new Date().toLocaleTimeString();

      setNodes(combinedNodes);
      setJobs(fetchedJobs);

      telemetryCache.nodes = combinedNodes;
      telemetryCache.jobs = fetchedJobs;
      telemetryCache.lastSynced = syncTime;
      setLastSynced(syncTime);

    } catch (err) {
      console.error('Error fetching dashboard database records:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Derived metrics calculations
  const totalNodes = nodes.length;
  const onlineNodes = nodes.filter(n => n.status === 'online').length;
  const offNodes = nodes.filter(n => n.status === 'off').length;

  const avgCpu = totalNodes > 0 
    ? Math.round(nodes.reduce((acc, curr) => acc + curr.cpu, 0) / totalNodes) 
    : 0;

  const avgRam = totalNodes > 0 
    ? Math.round(nodes.reduce((acc, curr) => acc + curr.ram, 0) / totalNodes) 
    : 0;

  const healthPercentage = totalNodes > 0 ? Math.round((onlineNodes / totalNodes) * 100) : 0;

  return (
    <div className="page-enter flex-1 overflow-y-auto" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* HEADER */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#efefed', letterSpacing: '-0.02em', margin: 0 }}>
            Syntrix Operations Dashboard
          </h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0 0' }}>
            Telemetry, hardware utilization, and active task executions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>
            Last Sync: <span style={{ color: '#efefed', fontWeight: 600 }}>{lastSynced || 'Syncing...'}</span>
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[7px] border cursor-pointer transition-all"
            style={{
              background: loading ? 'rgba(255,255,255,0.03)' : 'rgba(77,155,255,0.12)',
              borderColor: 'rgba(77,155,255,0.3)',
              color: '#4d9bff',
              fontSize: 11,
              fontWeight: 600
            }}
          >
            <span style={{ display: 'inline-block', transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform 0.8s linear' }}>
              🔄
            </span>
            {loading ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <motion.div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }} variants={ctr} initial="hidden" animate="show">
        {[
          { label: 'Total Managed Devices', value: totalNodes, sub: 'Registered Nodes', color: '#4d9bff', icon: '🖥' },
          { label: 'Online & Active', value: onlineNodes, sub: `${healthPercentage}% Health`, color: '#17c97c', icon: '📡' },
          { label: 'Avg CPU Load', value: `${avgCpu}%`, sub: 'Fleet Hardware', color: '#f0a020', icon: '⚡' },
          { label: 'Avg Memory Allocated', value: `${avgRam}%`, sub: 'Fleet RAM', color: '#a855f7', icon: '🧠' }
        ].map((k) => (
          <motion.div key={k.label} variants={itm}>
            <div className="card">
              <MeshTexture color={k.color} cx="85%" cy="30%" opacity={0.08} />
              <div className="card-body" style={{ padding: '14px 16px' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center justify-center rounded-[7px]" style={{ width: 26, height: 26, background: `${k.color}18`, fontSize: 12 }}>
                    {k.icon}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{k.sub}</div>
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{k.label}</div>
                {typeof k.value === 'number' ? (
                  <CountUp value={k.value} style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.06em', lineHeight: 1, color: k.color }} />
                ) : (
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.06em', lineHeight: 1, color: k.color }}>{k.value}</div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* DEVICE TELEMETRY TABLE & GAUGE */}
      <motion.div className="grid gap-[12px]" style={{ gridTemplateColumns: '2fr 1fr' }} variants={ctr} initial="hidden" animate="show">
        <motion.div variants={itm} className="card">
          <MeshTexture color="#4d9bff" cx="90%" cy="20%" opacity={0.07} />
          <div className="card-body">
            <CardHeader title="Device Hardware Telemetry" action={() => navigate('/inventory')} actionLabel="Full Inventory →" />

            <div className="grid gap-[8px] px-[7px] pb-[7px] mb-[3px]" style={{ gridTemplateColumns: '1.2fr 110px 70px 1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
              {['Hostname', 'IP Address', 'Status', 'CPU %', 'RAM %', 'Disk %'].map(h => (
                <div key={h} className="th">{h}</div>
              ))}
            </div>

            {loading && nodes.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Reading devices from database...</div>
            ) : nodes.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No device records found in DB.</div>
            ) : (
              nodes.map((n) => (
                <div key={n.id || n.name} className="grid items-center gap-[8px] px-[7px] py-[7px] rounded-[7px] border border-transparent" style={{ gridTemplateColumns: '1.2fr 110px 70px 1fr 1fr 1fr' }}>
                  <div className="flex items-center gap-[7px]">
                    <StatusDot status={n.status} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#efefed', fontFamily: 'monospace' }}>
                      {n.name}
                    </span>
                  </div>

                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                    {n.ip}
                  </div>

                  <div>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 5px',
                      borderRadius: 4,
                      background: n.status === 'online' ? 'rgba(23,201,124,0.1)' : 'rgba(224,85,85,0.1)',
                      color: n.status === 'online' ? '#17c97c' : '#e05555'
                    }}>
                      {n.status.toUpperCase()}
                    </span>
                  </div>

                  {/* CPU Percent */}
                  <div>
                    <div style={{ fontSize: 9.5, color: n.cpu > 80 ? '#e05555' : 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{n.cpu}%</div>
                    <ProgressBar value={n.cpu} height={3} />
                  </div>

                  {/* RAM Percent */}
                  <div>
                    <div style={{ fontSize: 9.5, color: n.ram > 85 ? '#e05555' : 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{n.ram}%</div>
                    <ProgressBar value={n.ram} height={3} />
                  </div>

                  {/* Disk Percent */}
                  <div>
                    <div style={{ fontSize: 9.5, color: n.disk > 90 ? '#e05555' : 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{n.disk}%</div>
                    <ProgressBar value={n.disk} height={3} />
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* WORKLOAD GAUGE */}
        <motion.div variants={itm} className="card flex flex-col">
          <MeshTexture color="#17c97c" cx="85%" cy="25%" opacity={0.07} />
          <div className="card-body flex flex-col flex-1 justify-between">
            <CardHeader title="Fleet Workload" />
            <div className="flex flex-col items-center justify-center my-auto py-2">
              <GaugeRing value={avgCpu} size={92} color="#4d9bff" label={`${avgCpu}`} sublabel="% CPU" delay={200} />
              <div style={{ fontSize: 12, fontWeight: 600, color: '#efefed', marginTop: 10 }}>Average Fleet Load</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{totalNodes} Active Devices</div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
              <div className="flex justify-between" style={{ fontSize: 10.5 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Database Status</span>
                <span style={{ fontWeight: 600, color: '#17c97c' }}>Connected</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* JOBS TABLE */}
      <motion.div variants={ctr} initial="hidden" animate="show">
        <motion.div variants={itm} className="card">
          <MeshTexture color="#a855f7" cx="90%" cy="20%" opacity={0.05} />
          <div className="card-body">
            <CardHeader title="Recent Automation Jobs" action={() => navigate('/automation')} actionLabel="Run Automation →" />

            <div className="grid gap-[8px] px-[7px] pb-[7px] mb-[3px]" style={{ gridTemplateColumns: '120px 1fr 1fr 1.2fr 120px', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
              {['Job ID', 'Domain', 'Action', 'Target Lab', 'Created At'].map(h => (
                <div key={h} className="th">{h}</div>
              ))}
            </div>

            {jobs.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11.5, color: 'rgba(255,255,255,0.3)' }}>No jobs logged in the public.jobs table.</div>
            ) : (
              jobs.map((j) => (
                <div key={j.id} className="grid items-center gap-[8px] px-[7px] py-[7px] rounded-[7px] border border-transparent" style={{ gridTemplateColumns: '120px 1fr 1fr 1.2fr 120px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                    {j.id ? `${j.id.slice(0, 8)}...` : 'N/A'}
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 600, color: '#4d9bff', fontFamily: 'monospace' }}>
                    {j.domain || 'N/A'}
                  </div>

                  <div style={{ fontSize: 11, color: '#efefed', fontFamily: 'monospace' }}>
                    {j.action || 'N/A'}
                  </div>

                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                    {j.target_lab || 'lab_1'}
                  </div>

                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                    {j.created_at ? new Date(j.created_at).toLocaleTimeString() : 'Recent'}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}