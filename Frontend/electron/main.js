// electron/main.js
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path   = require('path');
const { spawn } = require('child_process');

let AutoLaunch;
try { AutoLaunch = require('auto-launch'); } catch(e) { AutoLaunch = null; }

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let flaskProcess = null;

const autoLauncher = AutoLaunch ? new AutoLaunch({
  name: 'USAP',
  path: app.getPath('exe'),
}) : null;

// ── Flask ────────────────────────────────────────────────────────────────────
function startFlask() {
  const script = isDev
    ? path.join(__dirname, '..', 'flask-backend', 'app.py')
    : path.join(process.resourcesPath, 'flask-backend', 'app.py');

  flaskProcess = spawn('python', [script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  flaskProcess.stdout?.on('data', d => console.log('[Flask]', d.toString().trim()));
  flaskProcess.stderr?.on('data', d => console.error('[Flask ERR]', d.toString().trim()));
  console.log('[USAP] Flask started, PID:', flaskProcess.pid);
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 880,
    minWidth: 1100, minHeight: 700,
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

  const url = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '..', 'build', 'index.html')}`;

  mainWindow.loadURL(url);
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

// ── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  // Use a fallback empty icon if no image file
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
    { label: 'Dashboard',        click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', '/'); } },
    { label: 'Backup & Recovery',click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', '/backup'); } },
    { label: 'Alerts',           click: () => { mainWindow.show(); mainWindow.webContents.send('navigate', '/alerts'); } },
    { type: 'separator' },
    {
      label: 'Launch on startup', type: 'checkbox', checked: true,
      click: async (item) => {
        if (autoLauncher) {
          if (item.checked) await autoLauncher.enable();
          else await autoLauncher.disable();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit USAP', click: () => {
        app.isQuiting = true;
        if (flaskProcess) flaskProcess.kill();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('USAP — Unified SysAdmin Platform');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('window-minimize',  () => mainWindow.minimize());
ipcMain.handle('window-maximize',  () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.handle('window-close',     () => mainWindow.hide());
ipcMain.handle('get-auto-launch',  async () => autoLauncher ? autoLauncher.isEnabled() : false);
ipcMain.handle('set-auto-launch',  async (_, en) => { if (autoLauncher) { if (en) await autoLauncher.enable(); else await autoLauncher.disable(); } return en; });
ipcMain.handle('open-external',    (_, url) => shell.openExternal(url));

// ── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startFlask();
  createWindow();
  createTray();
  if (autoLauncher) {
    autoLauncher.isEnabled().then(en => { if (!en) autoLauncher.enable(); }).catch(() => {});
  }
});

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('activate', () => { if (mainWindow) mainWindow.show(); });
app.on('before-quit', () => {
  app.isQuiting = true;
  if (flaskProcess) flaskProcess.kill();
});
