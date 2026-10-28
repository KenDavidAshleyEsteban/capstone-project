const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const User = require('../models/User');
const Product = require('../models/Product');

test('buyer commerce requires authentication', async (t) => {
  const emailModule = require.resolve('../utils/sendEmail');
  require.cache[emailModule] = { id: emailModule, filename: emailModule, loaded: true, exports: async () => {} };
  const server = require('../app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/buyer/summary`);
  assert.equal(response.status, 401);
});

test('buyer reservations and loyalty stay with their authenticated account', { skip: !process.env.TEST_MONGODB_URI }, async (t) => {
  process.env.JWT_SECRET = 'isolated-buyer-http-test-secret';
  const database = `gunpla_buyer_test_${Date.now()}_${process.pid}`;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: database });
  await require('../models/Reservation').init();
  await require('../models/BuyerReceipt').init();
  await Promise.all([require('../models/LoyaltyWallet').init(), require('../models/PointClaim').init()]);
  await require('../models/RewardRedemption').init();
  await Promise.all([Product.init(), require('../models/Sale').init(), User.init()]);
  const [seller, otherSeller, buyer, otherBuyer] = await Promise.all(['seller', 'seller', 'buyer', 'buyer'].map((role, index) => User.create({
    username: `Commerce ${index}`, email: `commerce-${index}@test.invalid`, password: 'fixture-hash', role,
    storeName: `Commerce Store ${index}`, isVerified: true
  })));
  const emailModule = require.resolve('../utils/sendEmail');
  require.cache[emailModule] = { id: emailModule, filename: emailModule, loaded: true, exports: async () => {} };
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (path, user, method = 'GET', body, tokenRole) => {
    const token = user && jwt.sign({ id: String(user._id), role: tokenRole || user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const response = await fetch(`${base}${path}`, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const product = await Product.create({ id: 'COMMERCE-HG', name: 'HG Commerce Kit', grade: 'HG', skill: 'Beginner', price: 4000, stock: 3,
    status: 'Low Stock', image: 'images/product-placeholder.svg', storeId: String(seller._id) });
  const reserve = (extra = {}) => ({ requestId: randomUUID(), productId: product.id, quantity: 1, ...extra });
  let completedReceipt;

  await t.test('a buyer holds inventory once and sees only their own reservations', async () => {
    const request = reserve();
    const created = await api('/buyer/reservations', buyer, 'POST', request);
    assert.equal(created.status, 201);
    assert.equal(created.data.amount, 4000);
    assert.equal(created.data.status, 'Reserved');
    const repeated = await api('/buyer/reservations', buyer, 'POST', request);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.id, created.data.id);
    assert.equal((await api('/products/stock')).data.products[0].stock, 2);
    const mine = (await api('/buyer/summary', buyer)).data;
    assert.equal(mine.reservations.length, 1);
    assert.equal(mine.receipts.length, 0);
    assert.equal(mine.balance, 0);
    assert.equal((await api('/buyer/summary', otherBuyer)).data.reservations.length, 0);
    assert.equal((await api('/buyer/reservations', buyer, 'POST', { ...request, quantity: 2 })).status, 409);
    assert.equal((await api('/buyer/reservations', buyer, 'POST', reserve({ amount: 1 }))).status, 400);
    assert.equal((await api('/buyer/summary', seller)).status, 403);
    assert.equal((await api('/buyer/store/reservations', buyer, 'GET', null, 'seller')).status, 403);
    assert.equal((await api('/buyer/store/reservations', otherSeller)).data.reservations.length, 0);
  });
  await t.test('competing buyers cannot reserve the same remaining stock and cancellation restores it once', async () => {
    const attempts = await Promise.all([api('/buyer/reservations', buyer, 'POST', reserve({ quantity: 2 })), api('/buyer/reservations', otherBuyer, 'POST', reserve({ quantity: 2 }))]);
    assert.equal(attempts.filter((response) => response.status === 201).length, 1);
    assert.equal(attempts.filter((response) => response.status === 409).length, 1);
    assert.equal((await api('/products/stock')).data.products[0].stock, 0);
    const reservation = attempts.find((response) => response.status === 201).data;
    const owner = reservation.buyerId === String(buyer._id) ? buyer : otherBuyer;
    const outsider = owner === buyer ? otherBuyer : buyer;
    assert.equal((await api(`/buyer/reservations/${reservation.id}`, outsider, 'PATCH', { status: 'Cancelled' })).status, 404);
    assert.equal((await api(`/buyer/reservations/${reservation.id}`, otherSeller, 'PATCH', { status: 'Cancelled' })).status, 404);
    const retries = await Promise.all([1, 2].map(() => api(`/buyer/reservations/${reservation.id}`, owner, 'PATCH', { status: 'Cancelled' })));
    assert.ok(retries.every((response) => response.status === 200));
    assert.equal((await api('/products/stock')).data.products[0].stock, 2);
    const original = (await api('/buyer/summary', buyer)).data.reservations.find((row) => row.status === 'Reserved');
    assert.equal((await api(`/buyer/reservations/${original.id}`, seller, 'PATCH', { status: 'Cancelled' })).status, 200);
    assert.equal((await api('/products/stock')).data.products[0].stock, 3);
  });
  await t.test('only its store can complete a pickup, creating one sale and a private receipt without deducting stock again', async () => {
    const reservation = (await api('/buyer/reservations', buyer, 'POST', reserve())).data;
    assert.equal((await api(`/buyer/reservations/${reservation.id}`, buyer, 'PATCH', { status: 'Completed' })).status, 403);
    assert.equal((await api(`/buyer/reservations/${reservation.id}`, otherSeller, 'PATCH', { status: 'Completed' })).status, 404);
    const retries = await Promise.all([1, 2].map(() => api(`/buyer/reservations/${reservation.id}`, seller, 'PATCH', { status: 'Completed' })));
    assert.ok(retries.every((response) => response.status === 200));
    assert.equal((await api('/products/stock')).data.products[0].stock, 2);
    const sales = (await api('/sales', seller)).data.sales;
    assert.equal(sales.length, 1);
    assert.equal(sales[0].amount, 4000);
    assert.equal(sales[0].lineItems[0].quantity, 1);
    const summary = (await api('/buyer/summary', buyer)).data;
    assert.equal(summary.receipts.length, 1);
    completedReceipt = summary.receipts[0];
    assert.equal(completedReceipt.amount, 4000);
    assert.equal(completedReceipt.points, 400);
    assert.equal(completedReceipt.claimed, false);
    assert.match(completedReceipt.qrToken, /^gh1\./);
    assert.equal((await api('/buyer/summary', otherBuyer)).data.receipts.length, 0);
    assert.equal((await api(`/buyer/reservations/${reservation.id}`, buyer, 'PATCH', { status: 'Cancelled' })).status, 409);
    const cancelled = summary.reservations.find((row) => row.status === 'Cancelled');
    assert.equal((await api(`/buyer/reservations/${cancelled.id}`, seller, 'PATCH', { status: 'Completed' })).status, 409);
    const qrResponse = await fetch(`${base}/buyer/receipts/${completedReceipt.id}/qr`, { headers: { Authorization: `Bearer ${jwt.sign({ id: String(buyer._id), role: 'buyer' }, process.env.JWT_SECRET)}` } });
    assert.equal(qrResponse.status, 200);
    assert.match(qrResponse.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(qrResponse.headers.get('cache-control'), /no-store/);
    assert.match(await qrResponse.text(), /<svg/);
    assert.equal((await api(`/buyer/receipts/${completedReceipt.id}/qr`, otherBuyer)).status, 404);
  });
  await t.test('only the receipt buyer can claim its server-calculated points and concurrent scans earn once', async () => {
    assert.equal((await api('/buyer/claims', otherBuyer, 'POST', { token: completedReceipt.qrToken })).status, 404);
    const forged = completedReceipt.qrToken.slice(0, -1) + (completedReceipt.qrToken.endsWith('A') ? 'B' : 'A');
    assert.equal((await api('/buyer/claims', buyer, 'POST', { token: forged })).status, 400);
    assert.equal((await api('/buyer/claims', buyer, 'POST', { token: completedReceipt.qrToken, points: 10000 })).status, 400);
    const scans = await Promise.all([1, 2, 3].map(() => api('/buyer/claims', buyer, 'POST', { token: completedReceipt.qrToken, requestId: randomUUID() })));
    assert.ok(scans.every((response) => [200, 201].includes(response.status)));
    assert.equal(scans[0].data.balance, 400);
    assert.equal(scans[0].data.transaction.points, 400);
    assert.equal(scans[0].data.transaction.id, scans[1].data.transaction.id);
    const mine = (await api('/buyer/summary', buyer)).data;
    assert.equal(mine.balance, 400);
    assert.equal(mine.transactions.length, 1);
    assert.equal(mine.receipts[0].claimed, true);
    assert.equal(mine.receipts[0].qrToken, undefined);
    assert.equal((await api(`/buyer/receipts/${completedReceipt.id}/qr`, buyer)).status, 409);
    const other = (await api('/buyer/summary', otherBuyer)).data;
    assert.equal(other.balance, 0);
    assert.equal(other.transactions.length, 0);
  });
  await t.test('reward prices come from the server and competing redemptions cannot overdraw the buyer wallet', async () => {
    const catalog = await api('/buyer/rewards', buyer);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.rewards.find((reward) => reward.id === 'reward-voucher').cost, 500);
    assert.equal((await api('/buyer/redemptions', otherBuyer, 'POST', { rewardId: 'reward-panel', requestId: randomUUID() })).status, 409);
    assert.equal((await api('/buyer/redemptions', buyer, 'POST', { rewardId: 'reward-panel', cost: 0, requestId: randomUUID() })).status, 400);
    assert.equal((await api('/buyer/redemptions', buyer, 'POST', { rewardId: 'unknown-reward', requestId: randomUUID() })).status, 404);
    const requests = [1, 2].map(() => ({ rewardId: 'reward-panel', requestId: randomUUID() }));
    const results = await Promise.all(requests.map((request) => api('/buyer/redemptions', buyer, 'POST', request)));
    assert.equal(results.filter((response) => response.status === 201).length, 1);
    assert.equal(results.filter((response) => response.status === 409).length, 1);
    const winner = results.findIndex((response) => response.status === 201);
    assert.equal(results[winner].data.balance, 50);
    const repeated = await api('/buyer/redemptions', buyer, 'POST', requests[winner]);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.redemption.id, results[winner].data.redemption.id);
    assert.equal(repeated.data.redemption.code, results[winner].data.redemption.code);
    assert.equal((await api('/buyer/redemptions', buyer, 'POST', { ...requests[winner], rewardId: 'reward-voucher' })).status, 409);
    const mine = (await api('/buyer/summary', buyer)).data;
    assert.equal(mine.balance, 50);
    assert.equal(mine.redemptions.length, 1);
    assert.equal(mine.redemptions[0].cost, 350);
    const other = (await api('/buyer/summary', otherBuyer)).data;
    assert.equal(other.balance, 0);
    assert.equal(other.redemptions.length, 0);
  });
  await t.test('pickup receipts preserve the reserved cent price when the seller later changes the catalog price', async () => {
    assert.equal((await api(`/products/${product.id}`, seller, 'PUT', { price: 19.99, stock: 3 })).status, 200);
    const reservation = await api('/buyer/reservations', buyer, 'POST', reserve({ quantity: 3 }));
    assert.equal(reservation.status, 201);
    assert.equal(reservation.data.amount, 59.97);
    assert.equal((await api(`/products/${product.id}`, seller, 'PUT', { price: 999 })).status, 200);
    assert.equal((await api(`/buyer/reservations/${reservation.data.id}`, seller, 'PATCH', { status: 'Completed' })).status, 200);
    const receipt = (await api('/buyer/summary', buyer)).data.receipts.find((row) => row.reservationId === reservation.data.id);
    assert.equal(receipt.amount, 59.97);
    assert.equal(receipt.points, 5);
    assert.equal((await api('/products/stock')).data.products[0].stock, 0);
  });
  await t.test('an unverified store cannot hold buyer inventory for a pickup it cannot complete', async () => {
    const unverified = await User.create({ username: 'Pending Store', email: 'pending-store@test.invalid', password: 'fixture-hash', role: 'seller', storeName: 'Pending Store', isVerified: false });
    const pendingKit = await Product.create({ id: 'PENDING-HG', name: 'HG Pending Kit', grade: 'HG', skill: 'Beginner', price: 100, stock: 1,
      status: 'Low Stock', image: 'images/product-placeholder.svg', storeId: String(unverified._id) });
    assert.equal((await api('/buyer/reservations', buyer, 'POST', reserve({ productId: pendingKit.id }))).status, 409);
    assert.equal((await api('/products/stock')).data.products.find((row) => row.id === pendingKit.id).stock, 1);
    assert.ok(!(await api('/buyer/summary', buyer)).data.reservations.some((row) => row.productId === pendingKit.id));
  });
});
