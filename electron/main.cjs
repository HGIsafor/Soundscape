const { app, BrowserWindow, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./server.cjs');

app.setName('Soundscape');
const customData = app.commandLine.getSwitchValue('user-data-dir');
if (customData) app.setPath('userData', path.resolve(customData));

let mainWindow;
let miniWindow;
let server;
let origin;
let savedBounds;
const boundsPath = () => path.join(app.getPath('userData'), 'mini-player.json');
const secureWebPreferences = { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };

function miniBounds() {
  const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const defaults = { width: 500, height: 600, x: area.x + area.width - 524, y: area.y + area.height - 624 };
  const candidate = { ...defaults, ...savedBounds, width: 500, height: 600 };
  const display = screen.getDisplayMatching(candidate).workArea;
  const width = Math.min(display.width, 500);
  const height = Math.min(display.height, 600);
  return { width, height, x: Math.max(display.x, Math.min(candidate.x, display.x + display.width - width)), y: Math.max(display.y, Math.min(candidate.y, display.y + display.height - height)) };
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
      let bounds = child.getBounds();
      const remember = () => { bounds = child.getBounds(); };
      child.on('move', remember);
      child.on('resize', remember);
      child.on('closed', () => {
        savedBounds = bounds;
        try { fs.writeFileSync(boundsPath(), JSON.stringify(savedBounds)); } catch {}
        miniWindow = null;
      });
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
    try {
      const parsed = JSON.parse(fs.readFileSync(boundsPath(), 'utf8'));
      if (['x', 'y', 'width', 'height'].every(key => Number.isFinite(parsed[key]))) savedBounds = parsed;
    } catch {}
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
