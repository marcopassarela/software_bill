const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow;
let nextServer;
const PORT = 3210;
const APP_URL = `http://127.0.0.1:${PORT}`;

function waitForServer(url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let count = 0;

    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.setTimeout(1500, () => request.destroy());

      request.on('error', () => {
        count++;

        if (count >= attempts) {
          reject(new Error('O servidor do aplicativo não iniciou a tempo.'));
          return;
        }

        setTimeout(check, 1000);
      });

      request.on('timeout', () => {
        count++;

        if (count >= attempts) {
          reject(new Error('Tempo limite ao iniciar o aplicativo.'));
        } else {
          setTimeout(check, 1000);
        }
      });
    };

    check();
  });
}

function startNextServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'next', 'server.js')
    : path.join(__dirname, '..', '.next', 'standalone', 'server.js');

  const serverDirectory = path.dirname(serverPath);

  nextServer = spawn(process.execPath, [serverPath], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      BACKEND_URL: 'https://logisticasbill.vercel.app/api',
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  nextServer.on('error', (error) => {
    console.error('Erro ao iniciar o servidor Next.js:', error);
  });

  nextServer.on('exit', (code) => {
    if (code !== null && code !== 0 && app.isReady()) {
      console.error(`Servidor Next.js encerrou com código ${code}.`);
    }
  });
}

async function createWindow() {
  try {
    await waitForServer(APP_URL);

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1000,
      minHeight: 650,
      show: false,
      autoHideMenuBar: true,
      title: 'Logísticas Bill',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    await mainWindow.loadURL(APP_URL);

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (error) {
    dialog.showErrorBox(
      'Erro ao abrir o Logísticas Bill',
      `${error.message}\n\nVerifique a instalação e a conexão com o servidor.`
    );

    app.quit();
  }
}

app.whenReady().then(() => {
  startNextServer();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (nextServer && !nextServer.killed) {
    nextServer.kill();
  }
});
