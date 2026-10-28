const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('authentication validates accounts and recovers verification delivery safely', { skip: !process.env.TEST_MONGODB_URI }, async (t) => {
  process.env.JWT_SECRET = 'isolated-auth-http-test-secret';
  process.env.RESEND_API_KEY = 're_test_never_sent';
  process.env.EMAIL_MODE = 'file';
  process.env.BACKEND_URL = 'http://127.0.0.1:5000';
  process.env.FRONTEND_URL = 'http://127.0.0.1:5173';
  process.env.EMAIL_OUTBOX_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'gunpla-auth-outbox-'));
  const outbox = process.env.EMAIL_OUTBOX_DIR;
  const originalFetch = global.fetch;
  global.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return originalFetch(input, options);
    if (url.origin === 'https://api.resend.com') return new Response(JSON.stringify({ name: 'validation_error', message: 'Delivery rejected for this test.' }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    throw new Error('External network access is disabled in auth tests.');
  };
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await fs.rm(outbox, { recursive: true, force: true });
    global.fetch = originalFetch;
  });
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: `gunpla_auth_test_${Date.now()}_${process.pid}` });
  await require('../models/User').init();
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const api = async (route, body) => {
    const response = await fetch(`${base}${route}`, { method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers,
      data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
  };
  const registration = (extra = {}) => ({ username: 'Test Builder', email: 'builder@test.invalid', password: 'test-password-123', role: 'buyer', ...extra });

  await t.test('login never provisions an administrator from fallback or configured credentials', async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    assert.equal((await api('/login', { email: 'admin@gunplahub.com', password: 'gunplaadminaccess' })).status, 400);
    process.env.ADMIN_EMAIL = 'configured-admin@test.invalid';
    process.env.ADMIN_PASSWORD = 'configured-admin-password';
    assert.equal((await api('/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).status, 400);
  });

  await t.test('public registration rejects malformed account inputs and administrative roles', async () => {
    for (const [field, value] of [['username', {}], ['username', ' '], ['username', 'a'.repeat(81)], ['email', {}], ['email', 'not-an-email'], ['password', 12345678], ['password', 'short'], ['password', 'x'.repeat(73)]]) {
      const result = await api('/register', registration({ [field]: value }));
      assert.equal(result.status, 400, `${field} must be validated`);
      assert.equal(result.data.field, field);
    }
    process.env.ADMIN_SECRET = 'old-public-secret';
    const admin = await api('/register', registration({ role: 'admin', adminSecret: process.env.ADMIN_SECRET }));
    assert.equal(admin.status, 403);
  });

  await t.test('a buyer can use a local verification email before signing in', async () => {
    const registered = await api('/register', registration());
    assert.equal(registered.status, 201);
    assert.equal(registered.data.verificationRequired, true);
    const pending = await api('/login', { email: registration().email, password: registration().password });
    assert.equal(pending.status, 403);
    const messages = await fs.readdir(outbox);
    assert.equal(messages.length, 1);
    const mail = JSON.parse(await fs.readFile(path.join(outbox, messages[0]), 'utf8'));
    assert.equal(mail.to, 'builder@test.invalid');
    const link = mail.html.match(/href="([^"]+)"/)[1];
    assert.ok(link.startsWith('http://127.0.0.1:5000/api/auth/verify?token='));
    const verified = await api(`/verify${new URL(link).search}`);
    assert.equal(verified.status, 302);
    assert.equal(verified.headers.get('location'), 'http://127.0.0.1:5173/login.html?verified=true');
    assert.equal((await api(`/verify${new URL(link).search}`)).status, 400);
    const signedIn = await api('/login', { email: registration().email.toUpperCase(), password: registration().password });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.data.user.role, 'buyer');
    assert.equal(typeof signedIn.data.token, 'string');
  });

  await t.test('a rejected provider delivery remains recoverable without duplicate registration', async () => {
    const pending = registration({ email: 'delivery-failed@test.invalid' });
    process.env.EMAIL_MODE = 'resend';
    process.env.EMAIL_FROM = 'Gunpla Hub <verification@test.invalid>';
    const failed = await api('/register', pending);
    assert.equal(failed.status, 503);
    assert.equal(failed.data.code, 'VERIFICATION_EMAIL_FAILED');
    assert.equal(failed.data.email, pending.email);
    assert.equal((await api('/login', { email: pending.email, password: pending.password })).status, 403);
    const duplicate = await api('/register', pending);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.code, 'VERIFICATION_REQUIRED');
    process.env.EMAIL_MODE = 'file';
    assert.equal((await api('/resend-verification', { email: pending.email })).status, 200);
    const repeated = await api('/resend-verification', { email: pending.email });
    assert.equal(repeated.status, 429);
    assert.ok(Number(repeated.headers.get('retry-after')) > 0);
    const messages = await Promise.all((await fs.readdir(outbox)).map(async (file) => JSON.parse(await fs.readFile(path.join(outbox, file), 'utf8'))));
    const delivered = messages.find((mail) => mail.to === pending.email);
    assert.ok(delivered);
    const link = delivered.html.match(/href="([^"]+)"/)[1];
    assert.equal((await api(`/verify${new URL(link).search}`)).status, 302);
    assert.equal((await api('/login', { email: pending.email, password: pending.password })).status, 200);
  });

  await t.test('expired links can be replaced once, and concurrent resend requests share a cooldown', async (expiryTest) => {
    const pending = registration({ email: 'expired-link@test.invalid' });
    assert.equal((await api('/register', pending)).status, 201);
    const deliveredTo = async (email) => {
      const messages = await Promise.all((await fs.readdir(outbox)).map(async (file) => JSON.parse(await fs.readFile(path.join(outbox, file), 'utf8'))));
      return messages.filter((mail) => mail.to === email);
    };
    const original = (await deliveredTo(pending.email))[0].html.match(/href="([^"]+)"/)[1];
    expiryTest.mock.timers.enable({ apis: ['Date'], now: Date.now() + 24 * 60 * 60 * 1000 + 1000 });
    try {
      assert.equal((await api(`/verify${new URL(original).search}`)).status, 400);
      const retries = await Promise.all([api('/resend-verification', { email: pending.email }), api('/resend-verification', { email: pending.email })]);
      assert.deepEqual(retries.map((result) => result.status).sort(), [200, 429]);
      const mails = await deliveredTo(pending.email);
      assert.equal(mails.length, 2);
      const replacement = mails.map((mail) => mail.html.match(/href="([^"]+)"/)[1]).find((link) => link !== original);
      assert.ok(replacement);
      assert.equal((await api(`/verify${new URL(original).search}`)).status, 400);
      assert.equal((await api(`/verify${new URL(replacement).search}`)).status, 302);
      assert.equal((await api('/resend-verification', { email: pending.email })).status, 200);
      assert.equal((await api('/resend-verification', { email: 'unknown-account@test.invalid' })).status, 200);
      assert.equal((await deliveredTo(pending.email)).length, 2);
    } finally { expiryTest.mock.timers.reset(); }
  });
});
