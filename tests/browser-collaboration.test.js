'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const port = 32000 + Math.floor(Math.random() * 15000);
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let browser;

async function retry(fn, timeoutMs = 15000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try { return await fn(); }
    catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 150)); }
  }
  throw lastError;
}

(async () => {
  await retry(async () => {
    const res = await fetch(origin + '/api/collab/health');
    assert.equal(res.status, 200);
  });

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const first = await browser.newContext();
  const second = await browser.newContext();
  const alice = await first.newPage();
  const bob = await second.newPage();

  const errors = [];
  for (const [name, page] of [['alice', alice], ['bob', bob]]) {
    page.on('pageerror', error => errors.push(name + ': ' + error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(name + ': ' + message.text());
    });
  }

  await alice.goto(origin + '/?room=browser-test&role=teacher&name=Alice');
  await retry(async () => assert.equal(
    await alice.evaluate(() => window.Collab?.getConnectionStatus()?.roomReady), true
  ));
  await bob.goto(origin + '/?room=browser-test&role=student&name=Bob');
  await retry(async () => assert.equal(
    await bob.evaluate(() => window.Collab?.getConnectionStatus()?.roomReady), true
  ));

  const sticky = '#seed_l1_sticky';
  await retry(async () => {
    assert.equal(await alice.locator(sticky).count(), 1);
    assert.equal(await bob.locator(sticky).count(), 1);
  });

  const changed = 'Shared note edited by Alice ' + Date.now();
  await alice.locator(sticky + ' .sticky-textarea').fill(changed);
  await retry(async () => {
    assert.equal(await bob.locator(sticky + ' .sticky-textarea').inputValue(), changed);
  });

  const initialSize = await bob.locator(sticky).evaluate(el => ({
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height)
  }));
  await alice.locator(sticky).hover();
  const handle = alice.locator(sticky + ' .resize-handle-se');
  const rect = await handle.boundingBox();
  assert.ok(rect, 'The SE resize handle should have a bounding box');
  await alice.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(rect.x + rect.width / 2 + 130, rect.y + rect.height / 2 + 70, { steps: 8 });
  await alice.mouse.up();

  const desired = await alice.locator(sticky).evaluate(el => ({
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height)
  }));
  assert.ok(desired.width > initialSize.width + 50, 'Resize width locally did not change');
  assert.ok(desired.height > initialSize.height + 25, 'Resize height locally did not change');

  await retry(async () => {
    const remoteSize = await bob.locator(sticky).evaluate(el => ({
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height)
    }));
    assert.deepEqual(remoteSize, desired);
  });

  const third = await browser.newContext();
  const charlie = await third.newPage();
  charlie.on('pageerror', error => errors.push('charlie: ' + error.message));
  await charlie.goto(origin + '/?room=browser-test&role=student&name=Charlie');
  await retry(async () => {
    assert.equal(await charlie.evaluate(() => Collab.getConnectionStatus().roomReady), true);
    assert.equal(await charlie.locator(sticky + ' .sticky-textarea').inputValue(), changed);
    const size = await charlie.locator(sticky).evaluate(el => ({
      width: parseFloat(el.style.width), height: parseFloat(el.style.height)
    }));
    assert.deepEqual(size, desired);
  });
  if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n'));
  console.log('PASS: browser text editing, resizing and late join synchronization');
})().catch(error => {
  console.error('FAIL: ' + (error.stack || error));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  server.kill();
});
