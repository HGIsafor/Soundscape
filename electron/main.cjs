const { app, BrowserWindow, screen, shell } = require('electron');
const path = require('node:path');
const { startServer } = require('./server.cjs');

app.setName('Soundscape');
const customData = app.commandLine.getSwitchValue('user-data-dir');
if (customData) app.setPath('userData', path.resolve(customData));

let mainWindow;
let miniWindow;
let server;
let origin;
const secureWebPreferences = { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };

function miniBounds() {
  const monitor = screen.getDisplayMatching(mainWindow.getBounds());
  const area = monitor.workArea;
  const margin = 24;
  // 20% x 40% on a 16:9 monitor gives an 8:9 popup. Fit that shape on any screen.
  const scale = Math.min(monitor.bounds.width * 0.2 / 8, monitor.bounds.height * 0.4 / 9,
    Math.max(1, area.width - margin * 2) / 8, Math.max(1, area.height - margin * 2) / 9);
  const width = Math.max(1, Math.round(8 * scale));
  const height = Math.max(1, Math.round(9 * scale));
  return { width, height, x: Math.max(area.x, area.x + area.width - width - margin), y: Math.max(area.y, area.y + area.height - height - margin) };
}

function external(url) {
  try { if (new URL(url).protocol === 'https:') void shell.openExternal(url); } catch {}
}

function configureWindow(win, isAuth = false) {
  win.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    if (target.origin !== origin && !(isAuth && target.origin === 'https://accounts.spotify.com')) {
      event.preventDefault();
      external(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (win === mainWindow && url === 'about:blank' && frameName === 'soundscape-mini-player') {
      if (miniWindow && !miniWindow.isDestroyed()) { miniWindow.focus(); return { action: 'deny' }; }
      return { action: 'allow', overrideBrowserWindowOptions: {
        ...miniBounds(), title: 'Soundscape · Mini player', resizable: false,
        maximizable: false, fullscreenable: false,
        autoHideMenuBar: true, backgroundColor: '#131416', alwaysOnTop: true,
        webPreferences: secureWebPreferences,
      } };
    }
    // Keep OAuth in an isolated window so Expo can complete its opener session.
    if (win === mainWindow && new URL(url).origin === 'https://accounts.spotify.com') {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 740, autoHideMenuBar: true, webPreferences: secureWebPreferences } };
    }
    external(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child, details) => {
    if (details.frameName === 'soundscape-mini-player') {
      miniWindow = child;
      child.setMenu(null);
      child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      child.webContents.on('will-navigate', event => event.preventDefault());
      child.on('closed', () => { miniWindow = null; });
    } else configureWindow(child, true);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({ width: 1280, height: 850, minWidth: 800, minHeight: 600,
    title: 'Soundscape', backgroundColor: '#111111', autoHideMenuBar: true, webPreferences: secureWebPreferences });
  mainWindow.setMenu(null);
  configureWindow(mainWindow);
  mainWindow.on('closed', () => { mainWindow = null; app.quit(); });
  await mainWindow.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.restore(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    if (!app.isPackaged && process.env.SOUNDSCAPE_DEV_URL) {
      const url = new URL(process.env.SOUNDSCAPE_DEV_URL);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('Desktop development requires a local HTTP server.');
      origin = url.origin;
    } else {
      server = await startServer(path.join(app.getAppPath(), 'dist'), 43821);
      origin = 'http://127.0.0.1:43821';
    }
    await createWindow();
  }).catch(error => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { miniWindow?.close(); server?.close(); });
}
