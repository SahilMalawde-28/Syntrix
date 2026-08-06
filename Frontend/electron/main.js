const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let AutoLaunch;
try {
  AutoLaunch = require('auto-launch');
} catch (e) {
  AutoLaunch = null;
}

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;

const autoLauncher = AutoLaunch
  ? new AutoLaunch({
      name: 'USAP',
      path: app.getPath('exe'),
    })
  : null;

// ── Path Resolutions & Helpers ───────────────────────────────────────────────
const rawScriptPath = isDev
  ? path.resolve(__dirname, '..', '..', 'main.py')
  : path.join(process.resourcesPath, 'main.py');

const ROOT_DIR = path.dirname(rawScriptPath);
const CSV_FILE_PATH = path.join(ROOT_DIR, 'hosts_inventory.csv');

function toWslPath(winPath) {
  let p = winPath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(p)) {
    const drive = p[0].toLowerCase();
    p = `/mnt/${drive}${p.slice(2)}`;
  }
  return p;
}

// Helper: Ensure hosts_inventory.csv exists with seed host headers
function ensureInventoryFile() {
  const dir = path.dirname(CSV_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CSV_FILE_PATH) || fs.readFileSync(CSV_FILE_PATH, 'utf-8').trim() === '') {
    const defaultConfig = `hostname,mac_address,ip,status,os,group\nwsl_local,00:00:00:00:00:00,127.0.0.1,online,Linux,linux_hosts\n`;
    fs.writeFileSync(CSV_FILE_PATH, defaultConfig, 'utf-8');
  }
}

// Robust CSV line parser accounting for quotes
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Helper: Parse CSV text into registry storing exact group raw string
function parseCsvToRegistry(csvText) {
  const registry = {};
  if (!csvText || typeof csvText !== 'string') return registry;

  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return registry;

  const startIndex = lines[0].toLowerCase().includes('hostname') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const cols = parseCsvLine(line);
    if (cols.length < 1) continue;

    const hostname = cols[0].trim();
    if (!hostname) continue;

    const mac_address = (cols[1] || 'UNKNOWN').trim();
    const ip = (cols[2] || '0.0.0.0').trim();
    const status = (cols[3] || 'off').trim();
    const os = (cols[4] || 'Linux').trim();
    const rawGroup = cols.slice(5).join(';').replace(/['"]/g, '').trim();

    registry[hostname] = {
      ip: ip,
      mac_address: mac_address,
      status: status,
      os: os,
      group: rawGroup
    };
  }

  return registry;
}

// Helper: Convert registry object back to CSV preserving group raw string completely
function parseRegistryToCsv(registry) {
  const csvLines = ['hostname,mac_address,ip,status,os,group'];

  Object.keys(registry).forEach((hostKey) => {
    const hostData = registry[hostKey];
    
    let rawGroupStr = '';
    if (typeof hostData.group === 'string') {
      rawGroupStr = hostData.group;
    } else if (Array.isArray(hostData.groups)) {
      rawGroupStr = hostData.groups.join(';');
    }

    const mac = (hostData.mac_address || 'UNKNOWN').trim();
    const ip = (hostData.ip || '0.0.0.0').trim();
    const status = (hostData.status || 'off').trim();
    const os = (hostData.os || 'Linux').trim();

    csvLines.push(`${hostKey},${mac},${ip},${status},${os},${rawGroupStr}`);
  });

  return csvLines.join('\n') + '\n';
}

// ── Background Network Sync & INI Rebuilder Helpers ──────────────────────────
function runNetworkSync() {
  const wslWorkDirFolder = toWslPath(ROOT_DIR);
  const syncPyCmd = `from utils.csv_store import sync_network_hosts; sync_network_hosts()`;

  let spawnCmd = 'python3';
  let spawnArgs = ['-c', syncPyCmd];

  if (process.platform === 'win32') {
    spawnCmd = 'wsl.exe';
    const bashScript = `cd '${wslWorkDirFolder}' && export ANSIBLE_HOST_KEY_CHECKING=False && export PYTHONUNBUFFERED=1 && python3 -c "${syncPyCmd}"`;
    spawnArgs = ['-e', 'bash', '-c', bashScript];
  }

  const proc = spawn(spawnCmd, spawnArgs);
  proc.on('error', (err) => console.error('[Periodic Network Sync Error]:', err.message));
}

function rebuildIniOnly() {
  const wslWorkDirFolder = toWslPath(ROOT_DIR);
  const rebuildPyCmd = `from utils.csv_store import rebuild_hosts_ini; rebuild_hosts_ini()`;

  let spawnCmd = 'python3';
  let spawnArgs = ['-c', rebuildPyCmd];

  if (process.platform === 'win32') {
    spawnCmd = 'wsl.exe';
    const bashScript = `cd '${wslWorkDirFolder}' && export ANSIBLE_HOST_KEY_CHECKING=False && python3 -c "${rebuildPyCmd}"`;
    spawnArgs = ['-e', 'bash', '-c', bashScript];
  }

  const proc = spawn(spawnCmd, spawnArgs);
  proc.on('error', (err) => console.error('[Rebuild INI Error]:', err.message));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0c0c0d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
  });

  const devUrl = 'http://localhost:3000';
  const prodUrl = `file://${path.join(__dirname, '..', 'build', 'index.html')}`;

  if (isDev) {
    const loadDevServer = () => {
      mainWindow.loadURL(devUrl).catch(() => {
        setTimeout(loadDevServer, 1000);
      });
    };
    loadDevServer();
  } else {
    mainWindow.loadURL(prodUrl);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, '..', 'public', 'tray.png'));
    if (icon.isEmpty()) throw new Error('empty');
    icon = icon.resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: 'Open USAP', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Dashboard',         click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', '/'); } },
    { label: 'Backup & Recovery', click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', '/backup'); } },
    { label: 'Alerts',            click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', '/alerts'); } },
    { type: 'separator' },
    {
      label: 'Launch on startup',
      type: 'checkbox',
      checked: true,
      click: async (item) => {
        if (autoLauncher) {
          if (item.checked) await autoLauncher.enable();
          else await autoLauncher.disable();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit USAP',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('USAP — Unified SysAdmin Platform');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ── IPC Window Controls & Preferences ─────────────────────────────────────────
ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-maximize', () => (mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()));
ipcMain.handle('window-close', () => mainWindow.hide());
ipcMain.handle('get-auto-launch', async () => (autoLauncher ? autoLauncher.isEnabled() : false));
ipcMain.handle('set-auto-launch', async (_, en) => {
  if (autoLauncher) {
    if (en) await autoLauncher.enable();
    else await autoLauncher.disable();
  }
  return en;
});
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

// ── Inventory File (`hosts_inventory.csv`) IPC Bridge ─────────────────────────
ipcMain.handle('get-inventory', async () => {
  ensureInventoryFile();
  try {
    const rawContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    const parsedRegistry = parseCsvToRegistry(rawContent);
    return { success: true, registry: parsedRegistry, raw: rawContent };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update-inventory-file', async (event, updatedRegistry) => {
  ensureInventoryFile();
  try {
    const csvContent = parseRegistryToCsv(updatedRegistry);
    fs.writeFileSync(CSV_FILE_PATH, csvContent, 'utf-8');
    rebuildIniOnly();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Universal WSL Python Execution Bridge ─────────────────────────────────────
ipcMain.handle('run-automation', async (event, domainArg, actionArg, paramsArg = {}) => {
  return new Promise((resolve) => {
    let domain = domainArg;
    let action = actionArg;
    let params = paramsArg;

    if (typeof domainArg === 'object' && domainArg !== null) {
      domain = domainArg.domain;
      action = domainArg.action;
      params = domainArg.params || {};
    }

    const wslScriptPath = toWslPath(rawScriptPath);
    const wslWorkDirFolder = toWslPath(ROOT_DIR);

    const pyArgs = [wslScriptPath, String(domain), String(action)];

    const targetVal = params.target || 'all';
    pyArgs.push('--target', String(targetVal));

    if (params.group) pyArgs.push('--group', String(params.group));
    if (params.command) pyArgs.push('--command', String(params.command));
    if (params.password) pyArgs.push('--password', String(params.password));
    if (params.passwordHash) pyArgs.push('--password-hash', String(params.passwordHash));

    let spawnCmd = 'python3';
    let spawnArgs = pyArgs;

    if (process.platform === 'win32') {
      spawnCmd = 'wsl.exe';
      const formattedPyArgs = pyArgs.map(arg => `'${arg.replace(/'/g, "'\\''")}'`).join(' ');
      const bashScript = `cd '${wslWorkDirFolder}' && export ANSIBLE_HOST_KEY_CHECKING=False && export PYTHONUNBUFFERED=1 && python3 ${formattedPyArgs}`;
      spawnArgs = ['-e', 'bash', '-c', bashScript];
    }

    const pyProc = spawn(spawnCmd, spawnArgs);

    let stdoutData = '';
    let stderrData = '';

    const timeoutTimer = setTimeout(() => {
      pyProc.kill();
      resolve({
        status: 'error',
        return_code: 1,
        stdout: stdoutData,
        stderr: `Execution timed out after 30 seconds.`,
      });
    }, 30000);

    pyProc.stdout.on('data', (data) => { stdoutData += data.toString(); });
    pyProc.stderr.on('data', (data) => { stderrData += data.toString(); });

    pyProc.on('error', (err) => {
      clearTimeout(timeoutTimer);
      resolve({
        status: 'error',
        return_code: 1,
        stdout: stdoutData,
        stderr: `Failed to launch WSL/Python process: ${err.message}`,
      });
    });

    pyProc.on('close', (code) => {
      clearTimeout(timeoutTimer);
      let parsedOutput = null;

      const firstBrace = stdoutData.indexOf('{');
      const lastBrace = stdoutData.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsedOutput = JSON.parse(stdoutData.substring(firstBrace, lastBrace + 1));
        } catch (_) {
          parsedOutput = null;
        }
      }

      resolve({
        status: code === 0 ? 'success' : 'error',
        return_code: code,
        stdout: stdoutData,
        stderr: stderrData,
        ...(parsedOutput || {})
      });
    });
  });
});

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  runNetworkSync();
  setInterval(runNetworkSync, 30000);

  if (autoLauncher) {
    autoLauncher.isEnabled().then((en) => {
      if (!en) autoLauncher.enable();
    }).catch(() => {});
  }
});

app.on('window-all-closed', () => {});
app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});
app.on('before-quit', () => {
  app.isQuiting = true;
});