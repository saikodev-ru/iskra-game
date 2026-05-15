const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'iskra-game',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    backgroundColor: '#000000',
  });

  // In development: load from Next.js dev server
  // In production: load from built Next.js standalone server
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in dev mode (uncomment to enable)
    // mainWindow.webContents.openDevTools();
  } else {
    // Production: start the standalone Next.js server, then load it
    startProductionServer().then((port) => {
      mainWindow.loadURL(`http://localhost:${port}`);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Start the Next.js standalone server in production mode.
 * Returns the port the server is listening on.
 */
function startProductionServer() {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');

    const server = spawn(process.execPath, [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    server.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[Next.js]', msg.trim());
      if (msg.includes('Ready') || msg.includes('listening')) {
        resolve(3000);
      }
    });

    server.stderr.on('data', (data) => {
      console.error('[Next.js]', data.toString().trim());
    });

    server.on('error', (err) => {
      console.error('Failed to start Next.js server:', err);
      reject(err);
    });

    // Timeout fallback
    setTimeout(() => resolve(3000), 5000);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
