const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '../../..');
const output = path.join(root, '.tmp/browser-workflows', String(Date.now()));
fs.mkdirSync(output, { recursive: true });
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let replica, server, browser, socket, call;

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'isolated-browser-workflow-test-secret';
  process.env.EMAIL_MODE = 'file';
  process.env.EMAIL_OUTBOX_DIR = path.join(output, 'email-outbox');
  replica = await MongoMemoryReplSet.create({
    binary: {
      version: process.env.MONGOMS_VERSION || '7.0.24',
      downloadDir: path.join(root, '.tmp/mongodb-binaries'),
      ...(process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {})
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  await mongoose.connect(replica.getUri(), { dbName: `gunpla_browser_test_${Date.now()}_${process.pid}` });
  await Promise.all(['User', 'Product', 'Sale', 'Reservation', 'BuyerReceipt', 'LoyaltyWallet', 'PointClaim', 'RewardRedemption']
    .map(name => require(`../../models/${name}`).init()));
  server = require('../../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.BACKEND_URL = base;
  process.env.FRONTEND_URL = base;
  const password = 'Browser-workflow-password!';
  const api = async (route, token, method = 'GET', body) => {
    const response = await fetch(`${base}/api${route}`, {
      method, redirect: 'manual', headers: {
        'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
      }, ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data };
  };
  const accounts = [
    { username: 'Browser Buyer A', email: 'browser-a@test.invalid', role: 'buyer' },
    { username: 'Browser Buyer B', email: 'browser-b@test.invalid', role: 'buyer' },
    { username: 'Browser Seller', email: 'browser-seller@test.invalid', role: 'seller', storeName: 'Browser Test Store', storeLocation: 'Baguio' }
  ];
  for (const account of accounts) {
    assert.equal((await api('/auth/register', null, 'POST', { ...account, password })).status, 201);
    const messages = fs.readdirSync(process.env.EMAIL_OUTBOX_DIR).map(file => JSON.parse(fs.readFileSync(path.join(process.env.EMAIL_OUTBOX_DIR, file), 'utf8')));
    const message = messages.find(mail => mail.to === account.email);
    const verification = new URL(message.html.match(/href="([^"]+)"/)[1]);
    assert.equal((await fetch(verification, { redirect: 'manual' })).status, 302);
    const login = await api('/auth/login', null, 'POST', { email: account.email, password });
    assert.equal(login.status, 200);
    account.token = login.data.token;
  }
  const [buyerA, buyerB, seller] = accounts;
  for (const [id, name, price] of [['BROWSER-MG', 'Browser MG Kit', 4000], ['BROWSER-HG', 'Browser HG Kit', 1000]]) {
    assert.equal((await api('/products', seller.token, 'POST', { id, name, grade: 'MG', skill: 'Intermediate', price, stock: 3 })).status, 201);
  }
  results.push({ check: 'Real registration, file email verification, login and seller product creation', passed: true });

  const executable = process.env.BROWSER_PATH || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome'
  ].find(file => fs.existsSync(file));
  if (!executable) throw new Error('Set BROWSER_PATH to an installed Chromium, Chrome, or Edge executable.');
  const profile = path.join(output, 'browser-profile');
  browser = spawn(executable, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; !fs.existsSync(portFile) && attempt < 100; attempt++) await pause(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  });
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const value = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  };
  const waitFor = async (expression, description) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error(`Timed out: ${description}. Page: ${await evaluate('document.body.innerText.slice(-1800)')}`);
  };
  const navigate = async page => {
    await call('Page.navigate', { url: `${base}/${page}` });
    await waitFor(`location.pathname === ${JSON.stringify('/' + page)} && document.readyState === 'complete' && Boolean(document.querySelector('#app > *'))`, page);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const login = async account => {
    await navigate('login.html');
    await evaluate(`document.querySelector('#loginEmail').value=${JSON.stringify(account.email)}; document.querySelector('#loginPassword').value=${JSON.stringify(password)}; document.querySelector('#loginForm').requestSubmit();`);
    await waitFor(`document.querySelector('#modalBody')?.textContent.toLowerCase().includes('login successful')`, 'successful browser login');
  };
  const logout = async () => {
    await click('#logoutBtn');
    await waitFor(`!localStorage.getItem('token') && !localStorage.getItem('gunpla.account.v1')`, 'logout');
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "window.GUNPLA_API_URL=location.origin+'/api';" });
  await call('Network.setBlockedURLs', { urls: ['*://*.tile.openstreetmap.org/*'] });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await login(buyerA);
  await navigate('discover.html');
  await waitFor(`Boolean(document.querySelector('.reserve-btn[data-id="BROWSER-MG"]'))`, 'live catalog');
  await click('.reserve-btn[data-id="BROWSER-MG"]');
  await waitFor(`document.querySelector('#modalBody')?.textContent.toLowerCase().includes('reservation')`, 'reservation confirmation');
  let summary = (await api('/buyer/summary', buyerA.token)).data;
  assert.equal(summary.reservations.length, 1);
  assert.equal(summary.receipts.length, 0);
  assert.equal(summary.balance, 0);
  results.push({ check: 'Browser reservation holds stock without creating receipt or points', passed: true });
  await logout();
  await login(seller);
  await navigate('seller-dashboard.html');
  await waitFor(`Boolean(document.querySelector('.seller-reservation-action[data-status="Completed"]'))`, 'seller pickup queue');
  await click('.seller-reservation-action[data-status="Completed"]');
  await click('#confirmReservationUpdate');
  await waitFor(`!document.querySelector('#confirmReservationUpdate') && !document.querySelector('.seller-reservation-action[data-status="Completed"]')`, 'seller completion');
  summary = (await api('/buyer/summary', buyerA.token)).data;
  assert.equal(summary.receipts.length, 1);
  assert.equal(summary.receipts[0].points, 400);
  assert.equal(summary.balance, 0);
  results.push({ check: 'Seller UI completes pickup and creates one private receipt worth400points', passed: true });
  await logout();
  await login(buyerA);
  await navigate('receipts.html');
  await waitFor(`Boolean(document.querySelector('.view-receipt'))`, 'receipt');
  await click('.view-receipt');
  await waitFor(`Boolean(document.querySelector('.receipt-qr img')?.naturalWidth)`, 'real QR image');
  for (const width of [1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    assert.equal(await evaluate(`document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.modal-card').scrollWidth > document.querySelector('.modal-card').clientWidth + 1`), false, `Populated receipt or QR modal overflow at ${width}px`);
    results.push({ check: `Populated receipt and QR fit ${width}px`, passed: true });
    if (width === 320) {
      const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, 'receipt-mobile.png'), Buffer.from(screenshot.data, 'base64'));
    }
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const png = await evaluate(`(async () => {
    const image = document.querySelector('.receipt-qr img');
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 500;
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,500,500); context.drawImage(image,0,0,500,500);
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  const qrFile = path.join(output, 'receipt-qr.png');
  fs.writeFileSync(qrFile, Buffer.from(png, 'base64'));
  await navigate('scanqr.html');
  const document = await call('DOM.getDocument');
  const input = await call('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#scanFile' });
  await call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [qrFile] });
  await waitFor(`Boolean(document.querySelector('#scanToken')?.value)`, 'uploaded QR decoding');
  assert.equal(await evaluate(`document.querySelector('#scanToken').value`), summary.receipts[0].qrToken);
  await click('#scanBtn');
  await waitFor(`document.querySelector('#scanStatus')?.innerText.includes('400 points')`, 'QR claim');
  await navigate('points.html');
  await waitFor(`document.querySelector('.wallet h2')?.textContent === '400 pts'`, 'persisted wallet');
  await navigate('rewards.html');
  await waitFor(`Boolean(document.querySelector('.redeem-btn[data-id="reward-panel"]:not(:disabled)'))`, 'available reward');
  await click('.redeem-btn[data-id="reward-panel"]');
  await click('#confirmRedeem');
  await waitFor(`document.querySelector('#modalBody')?.textContent.toLowerCase().includes('reward redeemed')`, 'redemption');
  assert.equal((await api('/buyer/summary', buyerA.token)).data.balance, 50);
  results.push({ check: 'Real QR image upload decodes and claims400points;350point reward leaves50', passed: true });

  await logout();
  await evaluate(`localStorage.setItem('gunpla.receipts.v1',JSON.stringify([{id:'POISON-RECEIPT',points:999999}]));localStorage.setItem('gunpla.transactions.v1',JSON.stringify([{receiptId:'POISON-RECEIPT',points:999999}]));localStorage.setItem('gunpla.redemptions.v1',JSON.stringify([{title:'POISON-REWARD'}]));`);
  await login(buyerB);
  await navigate('points.html');
  await waitFor(`document.querySelector('.wallet h2')?.textContent === '0 pts'`, 'isolated buyer wallet');
  assert.equal(await evaluate(`document.body.innerText.includes('POISON-')`), false);
  await navigate('receipts.html');
  await waitFor(`!document.querySelector('#buyerLoading')`, 'second buyer receipts');
  assert.equal(await evaluate(`document.querySelectorAll('.receipt-card,.reservation-card').length`), 0);
  const other = (await api('/buyer/summary', buyerB.token)).data;
  assert.equal(other.balance, 0);
  assert.equal(other.receipts.length, 0);
  assert.equal(other.redemptions.length, 0);
  results.push({ check: 'Buyer switch clears prior receipts/points/rewards and ignores legacy browser data', passed: true });
  for (const width of [1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    for (const page of ['login.html', 'receipts.html', 'scanqr.html', 'points.html', 'rewards.html']) {
      await navigate(page);
      await waitFor(`!document.querySelector('#buyerLoading')`, 'loaded buyer page');
      assert.equal(await evaluate(`document.documentElement.scrollWidth > innerWidth + 1`), false, `${page} overflow at ${width}px`);
      results.push({ check: `${page} fits ${width}px`, passed: true });
    }
  }
  assert.deepEqual(exceptions, []);
  results.push({ check: 'No uncaught browser JavaScript errors', passed: true });
  console.log(JSON.stringify({ passed: results.length, output, results }, null, 2));
}

main().catch(async error => {
  console.error(error);
  results.push({ check: 'Browser workflow', passed: false, error: error.message });
  if (call && socket?.readyState === WebSocket.OPEN) {
    const screenshot = await call('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (screenshot) fs.writeFileSync(path.join(output, 'failure.png'), Buffer.from(screenshot.data, 'base64'));
  }
  process.exitCode = 1;
}).finally(async () => {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  if (call && socket?.readyState === WebSocket.OPEN) {
    call('Browser.close').catch(() => {});
    await pause(250);
    socket.close();
  }
  if (browser?.exitCode === null) browser.kill();
  if (server) await new Promise(resolve => server.close(resolve));
  if (mongoose.connection.readyState === 1 && /^gunpla_browser_test_/.test(mongoose.connection.name)) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (replica) await replica.stop();
});
