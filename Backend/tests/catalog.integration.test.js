const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');

// Always use a new test database; never read or mutate the application's database.
test('catalog API persists products and photos and enforces store ownership', { skip: !process.env.TEST_MONGODB_URI }, async (t) => {
  process.env.JWT_SECRET = 'isolated-catalog-integration-test-secret';
  const database = `gunpla_catalog_test_${Date.now()}`;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: database });
  await Product.init();
  const password = await bcrypt.hash('Catalog-test-password!', 4);
  const [admin, seller, other, buyer] = await Promise.all([
    User.create({ username: 'Admin', email: 'admin@test.invalid', password, role: 'admin' }),
    User.create({ username: 'Owner', email: 'owner@test.invalid', password, role: 'seller', storeName: 'Build Station' }),
    User.create({ username: 'Other', email: 'other@test.invalid', password, role: 'seller', storeName: 'Other Store' }),
    User.create({ username: 'Buyer', email: 'buyer@test.invalid', password, role: 'buyer' })
  ]);
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (path, user, method = 'GET', body) => {
    const token = user && jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json() };
  };
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=';
  const kit = { id: 'TEST-HG-1', name: 'HG Test Kit', grade: 'HG', skill: 'Beginner', price: 980.50, stock: 12, image: photo, description: 'A test kit.' };

  assert.equal((await api('/admin/dashboard')).status, 401);
  assert.equal((await api('/products', buyer, 'POST', kit)).status, 403);
  assert.equal((await api('/products', seller, 'POST', { ...kit, storeId: String(other._id) })).status, 400);
  const created = await api('/products', seller, 'POST', kit);
  assert.equal(created.status, 201);
  assert.equal(created.data.storeId, String(seller._id));
  assert.equal((await Product.findById(created.data._id)).image, photo);
  assert.equal((await api('/products', seller, 'POST', kit)).status, 409);
  assert.equal((await api('/admin/dashboard', seller)).data.products.length, 1);
  assert.equal((await api('/admin/dashboard', other)).data.products.length, 0);
  assert.equal((await api(`/products/${created.data._id}`, other, 'PUT', { stock: 0 })).status, 404);
  assert.equal((await api(`/products/${created.data._id}`, seller, 'PUT', { stock: -1 })).status, 400);
  assert.equal((await api(`/products/${created.data._id}`, seller, 'PUT', { storeId: String(other._id) })).status, 400);
  const edited = await api(`/products/${created.data._id}`, seller, 'PUT', { name: 'Updated kit', price: 1234.56, stock: 3, image: 'images/product-placeholder.svg' });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.status, 'Low Stock');
  assert.equal(edited.data.image, 'images/product-placeholder.svg');
  assert.equal((await Product.findById(created.data._id)).price, 1234.56);
  assert.equal((await api('/products')).data[0].name, 'Updated kit');
  const overview = (await api('/admin/dashboard', admin)).data;
  assert.equal(overview.stats.totalUsers, 4);
  assert.equal(overview.stats.inventoryValue, 3703.68);
  assert.equal(overview.stats.lowStock, 1);
  assert.equal((await api('/products/TEST-HG-1', seller, 'PUT', { stock: 0, status: 'Pre-order' })).data.status, 'Pre-order');
  assert.equal((await api(`/products/${created.data._id}`, admin, 'PUT', { storeId: String(other._id) })).status, 200);
  assert.equal((await api('/admin/dashboard', seller)).data.products.length, 0);
  assert.equal((await api('/admin/dashboard', other)).data.products.length, 1);
  const login = await api('/auth/login', null, 'POST', { email: admin.email, password: 'Catalog-test-password!' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, 'admin');
  const registered = await api('/auth/register', null, 'POST', { username: 'New Owner', email: 'new@test.invalid', password: 'Catalog-test-password!', role: 'seller', storeName: 'New Shop', storeLocation: 'Baguio' });
  assert.equal(registered.status, 201);
  assert.equal((await api('/products', seller, 'POST', { ...kit, id: 'TEST-HG-2', image: `data:image/png;base64,${'A'.repeat(4 * 1024 * 1024)}` })).status, 413);
  const page = await fetch(`${base}/html/admin-dashboard.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Your catalog, build-ready/);
});
