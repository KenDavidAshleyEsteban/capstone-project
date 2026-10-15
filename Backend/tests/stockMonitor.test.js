const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../Frontend/js/stock-monitor.js'), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(fetcher) {
  const timers = new Map();
  let nextTimer = 0;
  const window = new EventTarget();
  window.setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  const document = new EventTarget(); document.hidden = false;
  const navigator = { onLine: true };
  const context = vm.createContext({ window, document, navigator, AbortController, Intl, Date, fetch: fetcher });
  vm.runInContext(source, context);
  return { api: window.GUNPLA_STOCK_MONITOR, window, document, navigator, timers,
    async poll() { const timer = [...timers.entries()].find(([, timer]) => timer.delay === 15000); assert.ok(timer, 'next check is scheduled'); timers.delete(timer[0]); await timer[1].fn(); } };
}
const response = (products = [], status = 200) => ({ ok: status === 200, status, json: async () => ({ products, checkedAt: '2026-10-15T03:30:00Z' }) });

test('stock polling repeats every 15 seconds and merges metadata without discarding product photos', async () => {
  let calls = 0;
  const state = setup(async () => { calls++; return response([{ _id: 'p1', stock: calls, status: 'Low Stock' }]); });
  const products = [{ _id: 'p1', stock: 5, image: 'photo.png', description: 'Keep this description' }];
  const statuses = [];
  const monitor = state.api.create({ url: '/api/admin/stock', token: 'test', onData: (snapshot) => state.api.merge(products, snapshot), onState: (value) => statuses.push(value) });
  monitor.start(); await tick();
  assert.equal(calls, 1);
  assert.equal(products[0].stock, 1);
  assert.equal(products[0].image, 'photo.png');
  assert.equal(products[0].description, 'Keep this description');
  await state.poll();
  assert.equal(calls, 2);
  assert.equal(products[0].stock, 2);
  assert.equal(statuses.at(-1).status, 'live');
  assert.match(state.api.label(statuses.at(-1)), /Checked/);
  monitor.stop();
  assert.equal(state.timers.size, 0);
});

test('stock checks pause while an editor is dirty, including edits started during a request', async () => {
  let canUpdate = false;
  let calls = 0;
  let release;
  let applied = 0;
  const state = setup(() => { calls++; return new Promise((resolve) => { release = resolve; }); });
  const statuses = [];
  const monitor = state.api.create({ url: '/stock', canUpdate: () => canUpdate, onData: () => { applied++; }, onState: (value) => statuses.push(value.status) });
  monitor.start(); await tick();
  assert.equal(calls, 0);
  assert.equal(statuses.at(-1), 'paused');
  canUpdate = true;
  const pending = monitor.refresh();
  canUpdate = false;
  release(response([{ stock: 0 }])); await pending;
  assert.equal(applied, 0);
  assert.equal(statuses.at(-1), 'paused');
  monitor.stop();
});

test('manual refresh and scheduled checks never overlap', async () => {
  let calls = 0;
  let release;
  const state = setup(() => { calls++; return new Promise((resolve) => { release = resolve; }); });
  const monitor = state.api.create({ url: '/stock', onData() {} });
  monitor.start();
  const a = monitor.refresh(); const b = monitor.refresh();
  assert.equal(calls, 1);
  release(response()); await Promise.all([a, b]);
  assert.equal([...state.timers.values()].filter((timer) => timer.delay === 15000).length, 1);
  monitor.stop();
});

test('failed or offline checks retain values and recover on a later successful check', async () => {
  let calls = 0;
  let stock = 5;
  const statuses = [];
  const state = setup(async () => { calls++; if (calls === 1) throw new Error('Offline'); return response([{ stock: 2 }]); });
  const monitor = state.api.create({ url: '/stock', onData: (products) => { stock = products[0].stock; }, onState: (value) => statuses.push(value.status) });
  monitor.start(); await tick();
  assert.equal(stock, 5);
  assert.equal(statuses.at(-1), 'error');
  state.navigator.onLine = false;
  await state.poll();
  assert.equal(calls, 1);
  assert.equal(statuses.at(-1), 'offline');
  state.navigator.onLine = true;
  state.window.dispatchEvent(new Event('online')); await tick();
  assert.equal(stock, 2);
  assert.equal(statuses.at(-1), 'live');
  monitor.stop();
});

test('hidden tabs stop polling and visible tabs resume immediately', async () => {
  let calls = 0;
  const state = setup(async () => { calls++; return response(); });
  const monitor = state.api.create({ url: '/stock', onData() {} });
  monitor.start(); await tick();
  state.document.hidden = true;
  state.document.dispatchEvent(new Event('visibilitychange'));
  await monitor.refresh();
  assert.equal(calls, 1);
  assert.equal(state.timers.size, 0);
  state.document.hidden = false;
  state.document.dispatchEvent(new Event('visibilitychange')); await tick();
  assert.equal(calls, 2);
  monitor.stop();
});

test('expired authentication stops monitoring without replacing the last snapshot', async () => {
  let calls = 0;
  let applied = false;
  const statuses = [];
  const state = setup(async () => { calls++; return response([], 401); });
  const monitor = state.api.create({ url: '/stock', onData: () => { applied = true; }, onState: (value) => statuses.push(value.status) });
  monitor.start(); await tick(); await monitor.refresh();
  assert.equal(calls, 1);
  assert.equal(applied, false);
  assert.equal(statuses.at(-1), 'auth');
  assert.equal(state.timers.size, 0);
});

test('stopped monitors cannot apply old in-flight data and can be restarted safely', async () => {
  let calls = 0;
  let release;
  let applied = 0;
  const state = setup(() => { calls++; return calls === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(response()); });
  const monitor = state.api.create({ url: '/stock', onData: () => { applied++; } });
  monitor.start(); monitor.stop(); monitor.start();
  release(response()); await tick(); await tick();
  assert.equal(calls, 2);
  assert.equal(applied, 1);
  monitor.stop();
});
