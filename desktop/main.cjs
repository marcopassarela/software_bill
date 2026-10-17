const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const isDev = !app.isPackaged;
const appUrl = process.env.DESKTOP_APP_URL || null;
const apiUrl = process.env.DESKTOP_API_URL || null;
const updateStatePath = path.join(app.getPath('userData'), 'restart-reminder.json');
let nextServer;
let mainWindow;
let splashWindow;
let updateInProgress = false;
let updateTimer;

function sendSplash(message, progress = null, notes = '') {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('update-status', { message, progress, notes });
  }
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 330,
    resizable: false,
    frame: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#f8fafc',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, 'update.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

function openMain(targetUrl) {
  if (mainWindow && !mainWindow.isDestroyed()) return;
  mainWindow = new BrowserWindow({
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f1f5f9',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.removeMenu();
  mainWindow.loadURL(targetUrl);
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    mainWindow.show();
    scheduleRestartReminder();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function waitForServer(url, timeout = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - started > timeout) reject(new Error('Servidor local não iniciou a tempo.'));
        else setTimeout(attempt, 250);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    attempt();
  });
}

async function startNextServer() {
  if (isDev) return process.env.DESKTOP_DEV_URL || 'http://localhost:3000';

  const candidates = [
    path.join(process.resourcesPath, 'next', 'server.js'),
    path.join(process.resourcesPath, 'next', 'software_bill', 'server.js'),
    path.join(process.resourcesPath, 'next', 'gestao-logistica', 'server.js'),
  ];

  const standalone = candidates.find((p) => fs.existsSync(p));
  if (!standalone) {
    dialog.showErrorBox(
      'Servidor da aplicação',
      'server.js não encontrado em resources/next.\nCaminhos testados:\n' + candidates.join('\n')
    );
    throw new Error('server.js não encontrado');
  }

  const logPath = path.join(app.getPath('userData'), 'next-server.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n---- ${new Date().toISOString()} ----\n`);
  logStream.write(`server: ${standalone}\n`);

  const port = 43127;
  nextServer = spawn(process.execPath, [standalone], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      HOST: '127.0.0.1',
      ...(apiUrl
        ? { NEXT_PUBLIC_API_BROWSER: apiUrl, NEXT_PUBLIC_API_URL: apiUrl }
        : {}),
    },
    cwd: path.dirname(standalone),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  nextServer.stdout.on('data', (d) => logStream.write(d));
  nextServer.stderr.on('data', (d) => logStream.write(d));

  nextServer.on('exit', (code) => {
    logStream.write(`\nexit code: ${code}\n`);
    if (code && app.isReady()) {
      dialog.showErrorBox(
        'Servidor da aplicação',
        `O servidor local foi encerrado (código ${code}).\n\nVeja o log:\n${logPath}`
      );
    }
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

function releaseNotes(info) {
  const notes = info && info.releaseNotes;
  if (Array.isArray(notes)) return notes.map((item) => item.note || item).join('\n');
  return typeof notes === 'string' ? notes : 'Melhorias de estabilidade e correções de funcionalidades.';
}

async function checkForUpdates() {
  if (isDev || !app.isPackaged) return false;
  updateInProgress = true;
  sendSplash('Verificando atualizações…');
  let resolved = false;
  const fallback = setTimeout(() => {
    if (!resolved && !updateInProgress) return;
    resolved = true;
    updateInProgress = false;
    sendSplash('Abrindo o sistema…', 100);
  }, 8000);
  try {
    const result = await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    clearTimeout(fallback);
    if (!result) {
      resolved = true; updateInProgress = false;
      sendSplash('Não foi possível verificar agora. Abrindo o sistema…', 100);
      return false;
    }
    if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
      resolved = true; updateInProgress = false; sendSplash('Nenhuma atualização encontrada.', 100); return false;
    }
    return true;
  } catch (error) {
    clearTimeout(fallback);
    resolved = true; updateInProgress = false;
    sendSplash('Não foi possível verificar agora. Abrindo o sistema…', 100);
    return false;
  }
}

function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () => sendSplash('Verificando atualizações…'));
  autoUpdater.on('update-available', (info) => {
    sendSplash(`Atualização ${info.version} encontrada. Baixando…`, 0, releaseNotes(info));
  });
  autoUpdater.on('download-progress', (progress) => {
    sendSplash(`Baixando atualização… ${Math.round(progress.percent)}%`, progress.percent);
  });
  autoUpdater.on('update-not-available', () => {
    updateInProgress = false;
    sendSplash('Nenhuma atualização encontrada.', 100);
    setTimeout(() => openAfterStartup(), 350);
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateInProgress = false;
    sendSplash('Atualização concluída. Reiniciando o sistema…', 100, releaseNotes(info));
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 900);
  });
  autoUpdater.on('error', () => {
    updateInProgress = false;
    sendSplash('Atualização indisponível no momento. Abrindo o sistema…', 100);
    setTimeout(() => openAfterStartup(), 350);
  });
}

async function openAfterStartup() {
  if (mainWindow) return;
  const url = await startNextServer();
  openMain(url);
}

function readReminder() {
  try { return JSON.parse(fs.readFileSync(updateStatePath, 'utf8')); } catch { return { openedAt: Date.now(), warnings: 0 }; }
}
function saveReminder(state) { fs.mkdirSync(path.dirname(updateStatePath), { recursive: true }); fs.writeFileSync(updateStatePath, JSON.stringify(state)); }
function scheduleRestartReminder() {
  clearTimeout(updateTimer);
  const state = readReminder();
  if (!state.openedAt) state.openedAt = Date.now();
  const delay = Math.max(1000, 24 * 60 * 60 * 1000 - (Date.now() - state.openedAt));
  updateTimer = setTimeout(showRestartReminder, delay);
  saveReminder(state);
}
async function showRestartReminder() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const state = readReminder();
  state.warnings = (state.warnings || 0) + 1;
  state.openedAt = Date.now();
  saveReminder(state);
  const forced = state.warnings >= 3;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: forced ? 'Reinício obrigatório' : 'Atualização do sistema',
    message: forced ? 'É necessário reiniciar o sistema para continuar usando a versão mais recente.' : 'O sistema está aberto há 24 horas.',
    detail: forced ? 'Clique em “Reiniciar sistema” para verificar e instalar atualizações.' : 'Recomendamos reiniciar agora para verificar atualizações e aplicar melhorias.',
    buttons: forced ? ['Reiniciar sistema'] : ['Reiniciar agora', 'Lembrar depois'],
    defaultId: 0,
    cancelId: forced ? undefined : 1,
    noLink: true,
  });
  if (forced || result.response === 0) {
    app.relaunch();
    app.exit(0);
  } else scheduleRestartReminder();
}

app.whenReady().then(async () => {
  createSplash();
  setupUpdater();
  if (isDev) return openAfterStartup();
  const hasUpdate = await checkForUpdates();
  if (!hasUpdate && !updateInProgress) openAfterStartup();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { clearTimeout(updateTimer); if (nextServer) nextServer.kill(); });
ipcMain.handle('app-version', () => app.getVersion());
