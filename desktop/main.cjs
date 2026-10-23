const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const isDev = !app.isPackaged;
let bridgeProcess = null;
let staticServer = null;
let desktopOrigin = null;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startBundledBridge() {
  if (isDev || process.platform !== 'win32') return;

  const bridgePath = path.join(process.resourcesPath, 'AfroStudioLocalEngine.exe');
  if (!fs.existsSync(bridgePath)) {
    console.warn('[AfroStudio] Bundled local bridge was not found. AI bridge features will remain offline.');
    return;
  }

  bridgeProcess = spawn(bridgePath, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      AFROSTUDIO_ALLOWED_ORIGINS: desktopOrigin || '',
    },
  });

  bridgeProcess.on('error', (error) => {
    console.warn('[AfroStudio] Could not start local bridge:', error.message);
    bridgeProcess = null;
  });
  bridgeProcess.on('exit', (code) => {
    if (code && code !== 0) console.warn('[AfroStudio] Local bridge exited with code', code);
    bridgeProcess = null;
  });
}

function serveBuiltApp() {
  const distDir = path.join(__dirname, '..', 'dist');
  staticServer = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }

    let requestPath;
    try {
      requestPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }

    const relativePath = requestPath.replace(/^\/+/, '');
    let filePath = path.resolve(distDir, relativePath || 'index.html');
    if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(distDir, 'index.html');
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    fs.createReadStream(filePath)
      .on('error', () => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      })
      .pipe(response);
  });

  return new Promise((resolve, reject) => {
    staticServer.once('error', reject);
    staticServer.listen(0, '127.0.0.1', () => {
      const address = staticServer.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine the local app address.'));
        return;
      }
      desktopOrigin = 'http://127.0.0.1:' + address.port;
      resolve(desktopOrigin);
    });
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#111315',
    title: 'AfroStudio AI',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    await window.loadURL('http://127.0.0.1:5173');
  } else {
    await window.loadURL(desktopOrigin + '?desktop=1');
  }
}

app.whenReady().then(async () => {
  try {
    if (isDev) {
      await createWindow();
    } else {
      await serveBuiltApp();
      startBundledBridge();
      await createWindow();
    }
  } catch (error) {
    console.error('[AfroStudio] Startup failed:', error);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error);
  });
});

app.on('before-quit', () => {
  if (bridgeProcess && !bridgeProcess.killed) bridgeProcess.kill();
  if (staticServer) staticServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
