const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { _electron: electron, expect } = require('@playwright/test');
const { installFixture } = require('./mini-player-fixture.cjs');
const { checkPlayer } = require('./mini-player-smoke.cjs');

(async () => {
  const data = fs.mkdtempSync(path.resolve('.expo/desktop-test-'));
  const packaged = process.argv.includes('--packaged');
  const app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve('release/aspect-locked/win-unpacked/Soundscape.exe') } : {}),
    args: [...(packaged ? [] : ['electron/main.cjs']), `--user-data-dir=${data}`],
    env: { ...process.env, SOUNDSCAPE_DEV_URL: process.env.SOUNDSCAPE_TEST_URL || 'http://127.0.0.1:8082' },
  });
  try {
    const page = await app.firstWindow();
    const calls = await installFixture(app.context());
    await page.waitForURL(/127\.0\.0\.1/);
    await page.waitForLoadState('domcontentloaded');
    await page.reload();
    await expect(page.getByLabel('Open account')).toBeVisible();
    await checkPlayer(page, app.context(), calls);
    const opened = app.waitForEvent('window');
    await page.getByRole('button', { name: 'Open mini player' }).click();
    const playerWindow = await opened;
    await expect(playerWindow.getByRole('heading', { name: 'Midnight Drive' })).toBeVisible();
    await playerWindow.screenshot({ path: '.expo/mini-player-desktop.png' });
    const details = await app.evaluate(({ BrowserWindow, app }) => {
      const mini = BrowserWindow.getAllWindows().find(win => win.getTitle().includes('Mini player'));
      return { top: mini.isAlwaysOnTop(), resizable: mini.isResizable(), count: BrowserWindow.getAllWindows().length, preferences: mini.webContents.getLastWebPreferences(), userData: app.getPath('userData'), bounds: mini.getBounds() };
    });
    assert.equal(details.count, 2); assert.equal(details.top, true); assert.equal(details.resizable, false);
    assert.equal(details.bounds.width, 360); assert.equal(details.bounds.height, 590);
    assert.equal(details.preferences.nodeIntegration, false); assert.equal(details.preferences.contextIsolation, true);
    const mini = app.windows().find(win => win !== page);
    assert.equal(details.userData, data);
    await mini.getByRole('button', { name: 'Close mini player' }).click();
    await expect.poll(() => {
      try { return JSON.parse(fs.readFileSync(path.join(data, 'mini-player.json'))).width; } catch { return 0; }
    }).toBe(360);
    const restored = app.waitForEvent('window');
    await page.getByRole('button', { name: 'Open mini player' }).click();
    const restoredPlayer = await restored;
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.getTitle().includes('Mini player')).isResizable()), false);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => !win.getTitle().includes('Mini player')).minimize());
    await restoredPlayer.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(restoredPlayer.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => !win.getTitle().includes('Mini player')).restore());
    console.log('Electron: native mini window, shared controls, lifecycle, saved settings, always-on-top, remembered bounds, and isolated renderer passed.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
