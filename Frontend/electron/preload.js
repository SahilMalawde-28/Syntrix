// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window Controls ──────────────────────────────────────────────────────────
  minimize:      () => ipcRenderer.invoke('window-minimize'),
  maximize:      () => ipcRenderer.invoke('window-maximize'),
  close:         () => ipcRenderer.invoke('window-close'),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (en) => ipcRenderer.invoke('set-auto-launch', en),
  openExternal:  (url) => ipcRenderer.invoke('open-external', url),
  
  onNavigate:    (cb) => {
    const subscription = (_, route) => cb(route);
    ipcRenderer.on('navigate', subscription);
    return () => ipcRenderer.removeListener('navigate', subscription);
  },

  // ── Inventory File Bridge (`hosts.ini`) ─────────────────────────────────────
  getInventory: () => ipcRenderer.invoke('get-inventory'),
  updateInventoryFile: (registry) => ipcRenderer.invoke('update-inventory-file', registry),

  // ── Automation Bridge ────────────────────────────────────────────────────────
  runAutomation: (domain, action, params) => 
    ipcRenderer.invoke('run-automation', { domain, action, params })
});