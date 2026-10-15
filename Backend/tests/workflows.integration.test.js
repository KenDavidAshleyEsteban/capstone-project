const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Video = require('../models/BuildVideo');
const { randomUUID } = require('crypto');

test('completed sales and moderated videos persist with ownership enforced', { skip: !process.env.TEST_MONGODB_URI }, async (t) => {
  process.env.JWT_SECRET = 'isolated-workflow-test-secret';
  const database = `gunpla_workflow_test_${Date.now()}_${process.pid}`;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: database });
  const emailModule = require.resolve('../utils/sendEmail');
  require.cache[emailModule] = { id: emailModule, filename: emailModule, loaded: true, exports: async () => {} };
  await Promise.all([Product.init(), Sale.init(), Video.init()]);
  const [seller, other, buyer, admin] = await Promise.all(['seller', 'seller', 'buyer', 'admin'].map((role, index) => User.create({
    username: `Test ${role} ${index}`, email: `workflow-${index}@test.invalid`, password: 'test-hash', role, storeName: `Store ${index}`, isVerified: true
  })));
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (path, user, method = 'GET', body, headers = {}) => {
    const token = user && jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const response = await fetch(`${base}${path}`, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': Buffer.isBuffer(body) ? 'video/mp4' : 'application/json' } : {}), ...headers },
      ...(body ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}) });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    return { status: response.status, data, headers: response.headers };
  };
  const today = require('../utils/saleValidation').today();
  const product = await Product.create({ id: 'WORK-HG-1', name: 'HG Work Kit', grade: 'HG', skill: 'Beginner', price: 100, stock: 5, status: 'Low Stock', image: 'images/product-placeholder.svg', storeId: String(seller._id) });
  const sale = (extra = {}) => ({ requestId: randomUUID(), type: 'product', productId: String(product._id), quantity: 2, unitPrice: 98.25, date: today, deductStock: true, ...extra });

  await t.test('recording a sale saves exact quantities and reduces only its store inventory', async () => {
    assert.equal((await api('/sales')).status, 401);
    assert.equal((await api('/sales', buyer, 'POST', sale())).status, 403);
    assert.equal((await api('/sales', other, 'POST', sale())).status, 404);
    const request = sale();
    const saved = await api('/sales', seller, 'POST', request);
    assert.equal(saved.status, 201);
    assert.equal(saved.data.amount, 196.5);
    assert.equal(saved.data.lineItems[0].quantity, 2);
    assert.equal(saved.data.lineItems[0].productId, product.id);
    assert.equal(saved.data.storeId, String(seller._id));
    assert.equal((await Product.findById(product._id)).stock, 3);
    assert.equal((await api('/sales', seller, 'POST', request)).status, 200);
    assert.equal((await Product.findById(product._id)).stock, 3);
    assert.equal((await api('/sales', seller, 'POST', { ...request, quantity: 1 })).status, 409);
    assert.equal((await api('/sales', other)).data.sales.length, 0);
    assert.equal((await api('/sales', seller)).data.sales.length, 1);
  });
  await t.test('concurrent retries and overselling cannot deduct stock twice', async () => {
    const request = sale({ quantity: 1 });
    const retries = await Promise.all([api('/sales', seller, 'POST', request), api('/sales', seller, 'POST', request)]);
    assert.ok(retries.every((response) => [200, 201].includes(response.status)));
    assert.equal(await Sale.countDocuments({ requestId: request.requestId }), 1);
    assert.equal((await Product.findById(product._id)).stock, 2);
    const competing = await Promise.all([api('/sales', seller, 'POST', sale()), api('/sales', seller, 'POST', sale())]);
    assert.equal(competing.filter((response) => response.status === 201).length, 1);
    assert.equal(competing.filter((response) => response.status === 409).length, 1);
    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 0);
    assert.equal(updated.status, 'Out of Stock');
  });
  await t.test('historical sales and offers can be recorded without repeating a stock movement', async () => {
    assert.equal((await api('/sales', seller, 'POST', sale({ deductStock: false }))).status, 201);
    assert.equal((await Product.findById(product._id)).stock, 0);
    const offer = await api('/sales', seller, 'POST', { requestId: randomUUID(), type: 'offer', offerId: 'panel-lining', name: 'Panel lining', category: 'Service', quantity: 1, unitPrice: 250, date: today, deductStock: false });
    assert.equal(offer.status, 201);
    assert.equal(offer.data.source, 'seller-offer');
    assert.equal(offer.data.amount, 250);
    assert.equal((await api('/sales', seller, 'POST', sale({ quantity: -1 }))).status, 400);
    assert.equal((await api('/sales', seller, 'POST', sale({ date: '2999-01-01' }))).status, 400);
    assert.equal((await api('/sales', seller, 'POST', sale({ storeId: String(other._id) }))).status, 400);
  });

  await t.test('extended revenue history includes older sales while keeping store ownership and date limits', async () => {
    const prior = new Date(`${today}T00:00:00Z`);
    prior.setUTCDate(prior.getUTCDate() - 100);
    const saved = await api('/sales', seller, 'POST', sale({ date: prior.toISOString().slice(0, 10), deductStock: false }));
    assert.equal(saved.status, 201);
    const short = await api('/sales?days=28', seller);
    const long = await api('/sales?days=366', seller);
    assert.ok(!short.data.sales.some((receipt) => receipt.id === saved.data.id));
    assert.ok(long.data.sales.some((receipt) => receipt.id === saved.data.id));
    assert.ok(long.data.sales.every((receipt) => receipt.storeId === String(seller._id)));
    assert.equal((await api('/sales?days=366', other)).data.sales.length, 0);
    assert.equal((await api('/sales?days=367', seller)).status, 400);
    assert.equal((await api('/sales?days=0', seller)).status, 400);
  });

  const content = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(24)]);
  const details = { title: 'HG Build Review', grade: 'HG', notes: 'Panel lining', fileName: 'build.mp4', size: content.length, type: 'video/mp4' };
  let videoId;
  await t.test('uploads are monitored and remain private until an admin approves them', async () => {
    assert.equal((await api('/build-videos', null, 'POST', details)).status, 401);
    const created = await api('/build-videos', buyer, 'POST', details);
    assert.equal(created.status, 201);
    videoId = created.data.id;
    assert.equal((await api('/build-videos/review', buyer)).status, 403);
    assert.equal((await api(`/build-videos/${videoId}/content`, other, 'PUT', content)).status, 409);
    const uploaded = await api(`/build-videos/${videoId}/content`, buyer, 'PUT', content);
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.data.status, 'pending');
    assert.equal((await api('/build-videos')).data.videos.length, 0);
    assert.equal((await api(`/build-videos/${videoId}/content`)).status, 404);
    assert.equal((await api(`/build-videos/${videoId}/content`, other)).status, 404);
    assert.equal((await api(`/build-videos/${videoId}/content`, buyer)).status, 200);
    const queue = await api('/build-videos/review', admin);
    assert.equal(queue.data.counts.pending, 1);
    assert.equal(queue.data.videos[0].builder, buyer.username);
    assert.equal(queue.data.videos[0].size, content.length);
    assert.equal((await api(`/build-videos/${videoId}/review`, buyer, 'PATCH', { decision: 'approved' })).status, 403);
    assert.equal((await api(`/build-videos/${videoId}/review`, admin, 'PATCH', { decision: 'approved', note: 'Ready to share' })).status, 200);
    assert.equal((await api('/build-videos')).data.videos.length, 1);
    const publicFile = await api(`/build-videos/${videoId}/content`);
    assert.deepEqual(publicFile.data, content);
    const range = await api(`/build-videos/${videoId}/content`, null, 'GET', null, { Range: 'bytes=4-11' });
    assert.equal(range.status, 206);
    assert.deepEqual(range.data, content.subarray(4, 12));
    assert.equal((await api(`/build-videos/${videoId}/content`, null, 'GET', null, { Range: 'bytes=9999-' })).status, 416);
  });
  await t.test('rejection unpublishes content and preserves reviewer history and reasons', async () => {
    assert.equal((await api(`/build-videos/${videoId}/review`, admin, 'PATCH', { decision: 'rejected', note: '' })).status, 400);
    assert.equal((await api(`/build-videos/${videoId}/review`, admin, 'PATCH', { decision: 'rejected', note: 'Please upload a clearer build video.' })).status, 200);
    assert.equal((await api('/build-videos')).data.videos.length, 0);
    assert.equal((await api(`/build-videos/${videoId}/content`)).status, 404);
    const mine = (await api('/build-videos/mine', buyer)).data.videos[0];
    assert.equal(mine.status, 'rejected');
    assert.equal(mine.reviewNote, 'Please upload a clearer build video.');
    assert.equal(mine.reviewer, admin.username);
    assert.equal((await Video.findById(videoId)).reviewHistory.length, 2);
    const history = (await api('/build-videos/review?status=rejected', admin)).data.videos[0].reviewHistory;
    assert.equal(history.length, 2);
    assert.equal(history[0].decision, 'approved');
    assert.equal(history[1].reviewerId, String(admin._id));
    assert.equal((await api(`/build-videos/${videoId}`, other, 'DELETE')).status, 404);
    assert.equal((await api(`/build-videos/${videoId}`, buyer, 'DELETE')).status, 200);
    assert.equal((await api('/build-videos/mine', buyer)).data.videos.length, 0);
  });
  await t.test('invalid uploads fail validation and cannot be published', async () => {
    assert.equal((await api('/build-videos', buyer, 'POST', { ...details, type: 'text/html' })).status, 400);
    assert.equal((await api('/build-videos', buyer, 'POST', { ...details, size: 101 * 1024 * 1024 })).status, 400);
    assert.equal((await api('/build-videos', buyer, 'POST', { ...details, status: 'approved' })).status, 400);
    const invalid = await api('/build-videos', buyer, 'POST', details);
    const failed = await api(`/build-videos/${invalid.data.id}/content`, buyer, 'PUT', Buffer.alloc(content.length));
    assert.equal(failed.status, 400);
    assert.equal((await Video.findById(invalid.data.id)).status, 'failed');
    assert.equal((await api(`/build-videos/${invalid.data.id}/review`, admin, 'PATCH', { decision: 'approved' })).status, 409);
    assert.equal(await mongoose.connection.db.collection('buildVideos.files').countDocuments({}), 1);
  });
  await t.test('new review and sales scripts are served by the shared server application', async () => {
    for (const file of ['video-review.html', 'js/build-videos.js', 'js/seller-sales.js']) {
      assert.equal((await fetch(`${base.replace(/\/api$/, '')}/${file}`)).status, 200);
    }
  });
});
