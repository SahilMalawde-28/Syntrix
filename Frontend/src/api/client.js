// src/api/client.js
import axios from 'axios';

const BASE = 'http://127.0.0.1:5000/api';
const api  = axios.create({ baseURL: BASE, timeout: 120000 });

// Health
export const checkHealth = () => api.get('/health');

// Inventory
export const pingAll     = () => api.get('/inventory/ping');
export const gatherFacts = () => api.get('/inventory/facts');

// Domain 8 — Backup (streaming via EventSource)
export const streamBackup  = (hosts = 'windows_lab') =>
  new EventSource(`${BASE}/backup/run/stream?hosts=${hosts}`);
export const streamRestore = (backup_id, hosts = 'windows_lab') =>
  new EventSource(`${BASE}/backup/restore/stream?backup_id=${encodeURIComponent(backup_id)}&hosts=${hosts}`);
export const streamVerify  = (hosts = 'windows_lab') =>
  new EventSource(`${BASE}/backup/verify/stream?hosts=${hosts}`);

export const backupUser     = (username, hosts = 'windows_lab') => api.post('/backup/user',     { username, hosts });
export const scheduleBackup = (interval = 1440, hosts = 'windows_lab') => api.post('/backup/schedule', { interval, hosts });
export const cleanupBackups = (keep = 5, hosts = 'windows_lab') => api.post('/backup/cleanup',  { keep, hosts });

// Domain 1 — Users
export const createUser = (username, password, hosts = 'lab') => api.post('/users/create', { username, password, hosts });
export const deleteUser = (username, hosts = 'lab')            => api.post('/users/delete', { username, hosts });
export const listUsers  = ()                                   => api.get('/users/list');

// Domain 2 — Software
export const installSoftware = (pkg, hosts = 'lab') => api.post('/software/install', { package: pkg, hosts });
export const removeSoftware  = (pkg, hosts = 'lab') => api.post('/software/remove',  { package: pkg, hosts });
export const updatePatches   = (hosts = 'lab')      => api.post('/patches/update',   { hosts });

// Domain 3 — Config
export const applyConfig = (hosts = 'lab') => api.post('/config/apply', { hosts });

// Domain 4 — Monitor
export const checkDisk   = () => api.get('/monitor/disk');
export const checkMemory = () => api.get('/monitor/memory');
export const checkUptime = () => api.get('/monitor/uptime');

// Domain 6 — Services
export const restartService = (service, hosts = 'lab') => api.post('/services/restart', { service, hosts });

// Domain 7 — Network
export const networkPing = (target, hosts = 'lab') => api.post('/network/ping', { target, hosts });

// Domain 9 — Logs
export const collectLogs = (hosts = 'lab') => api.post('/logs/collect', { hosts });

// Domain 10 — Provisioning
export const provisionNode = (hosts = 'lab') => api.post('/provision/new', { hosts });

// Domain 11 — Compliance
export const complianceCheck = (hosts = 'lab') => api.post('/compliance/check', { hosts });

// Domain 12 — Diagnostics
export const runDiagnostics = (hosts = 'lab') => api.post('/diagnostics/run', { hosts });

export default api;
