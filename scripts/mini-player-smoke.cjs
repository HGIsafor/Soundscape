const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const { installFixture } = require('./mini-player-fixture.cjs');

async function checkPlayer(page, context, calls) {
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Sound profiles', exact: true }).click();
  let mini = await opened;
  await expect(mini.getByRole('heading', { name: 'Midnight Drive' })).toBeVisible();
  await mini.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(mini.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  assert.ok(calls.some(call => call.path.endsWith('/pause')));
  await mini.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(mini.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await mini.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(mini.getByRole('heading', { name: 'Morning Light' })).toBeVisible();
  await mini.getByRole('button', { name: 'Previous track', exact: true }).click();
  await expect(mini.getByRole('heading', { name: 'Midnight Drive' })).toBeVisible();
  const seek = mini.getByRole('slider', { name: 'Seek playback' });
  await seek.focus(); await seek.press('End');
  await expect.poll(() => calls.some(call => call.query === '?position_ms=210000')).toBe(true);
  await seek.press('Home');
  await expect.poll(() => calls.some(call => call.query === '?position_ms=0')).toBe(true);
  const seekBox = await seek.boundingBox();
  await mini.mouse.click(seekBox.x + seekBox.width / 2, seekBox.y + seekBox.height / 2);
  await expect.poll(() => calls.some(call => {
    const position = Number(new URLSearchParams(call.query).get('position_ms'));
    return position >= 100000 && position <= 110000;
  })).toBe(true);
  calls.failNext = true;
  await mini.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(mini.getByRole('alert')).toContainText('Spotify returned 403');
  await expect(mini.getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
  await mini.getByRole('button', { name: 'Open Playback', exact: false }).click();
  await expect(page.getByText('Turntable', { exact: true })).toBeVisible();
  // A second open focuses the existing window rather than making a duplicate.
  await page.getByRole('button', { name: 'Open mini player', exact: true }).click();
  assert.equal(context.pages().filter(p => !p.isClosed()).length, 2);
  const closed = mini.waitForEvent('close');
  await mini.getByRole('button', { name: 'Close mini player', exact: true }).click(); await closed;
  await page.getByRole('button', { name: 'Sound profiles', exact: true }).click();
  await page.waitForTimeout(700);
  assert.equal(context.pages().filter(p => !p.isClosed()).length, 1, 'X suppresses automatic reopening');
  const reopened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open mini player', exact: true }).click(); mini = await reopened;
  await mini.getByRole('button', { name: 'Mini-player options' }).click();
  const disabledClose = mini.waitForEvent('close');
  await mini.getByRole('checkbox', { name: 'Enable mini player' }).click(); await disabledClose;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open mini player' })).toBeDisabled();
  await page.getByRole('button', { name: 'Mini-player settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable mini player' }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open mini player' })).toBeEnabled();
}

async function main() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const calls = await installFixture(context);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.SOUNDSCAPE_TEST_URL || 'http://127.0.0.1:8082');
    await expect(page.getByLabel('Open account')).toBeVisible();
    await checkPlayer(page, context, calls);
    // Popup blockers should produce an actionable message, not a dead button.
    await page.evaluate(() => { window.open = () => null; });
    await page.getByRole('button', { name: 'Open mini player' }).click();
    await expect(page.getByRole('status')).toContainText('Allow popups');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Open mini player' })).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log('Browser: shared transport, seeking, automatic open, singleton, X, saved disable/re-enable, popup blocker, and mobile exclusion passed.');
  } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkPlayer };
