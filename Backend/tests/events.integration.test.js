const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Event');
const initializeEvents = require('../utils/initializeEvents');

test('events and RSVPs persist with authenticated ownership and atomic seat limits', { skip: !process.env.TEST_MONGODB_URI }, async (t) => {
  process.env.JWT_SECRET = 'isolated-events-test-secret';
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: `gunpla_events_test_${Date.now()}_${process.pid}` });
  const emailModule = require.resolve('../utils/sendEmail');
  require.cache[emailModule] = { id: emailModule, filename: emailModule, loaded: true, exports: async () => {} };
  await initializeEvents();
  const [admin, buyer, seller, other, third] = await Promise.all(['admin', 'buyer', 'seller', 'buyer', 'buyer'].map((role, i) => User.create({
    role, username: `Events ${i}`, email: `event-${i}@test.invalid`, password: 'test-hash', isVerified: true
  })));
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (path = '', user, method = 'GET', body, claims = {}) => {
    const token = user && jwt.sign({ id: String(user._id), role: user.role, ...claims }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const response = await fetch(`${base}/api/events${path}`, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 14);
  const details = { title: 'Confirmed test build', type: 'Workshop', description: 'A test listing only.', status: 'confirmed',
    date: future.toISOString().slice(0, 10), startTime: '13:00', endTime: '16:00', venue: 'Test venue', address: 'Test address',
    organizer: 'Test organizer', fee: 0, capacity: 2, agenda: ['Clipping'], bring: ['Kit'], included: ['Workspace'] };
  let event;

  await t.test('sample initialization is idempotent and public event lists do not expose attendee identities', async () => {
    assert.equal(await Event.countDocuments(), 3);
    await Event.updateOne({ id: 'event-build-night' }, { $set: { description: 'Preserve this admin edit.' } });
    await initializeEvents();
    assert.equal(await Event.countDocuments(), 3);
    assert.equal((await Event.findOne({ id: 'event-build-night' })).description, 'Preserve this admin edit.');
    const list = await api();
    assert.equal(list.status, 200);
    assert.equal(list.data.canManage, false);
    assert.equal(list.data.events.length, 3);
    assert.ok(list.data.events.every((item) => !item.rsvpOpen && item.myRsvp === null && !('attendees' in item)));
    assert.equal((await api('', admin)).data.canManage, true);
  });

  await t.test('only database-verified admins publish valid schedules and change event metadata', async () => {
    assert.equal((await api('', null, 'POST', details)).status, 401);
    assert.equal((await api('', buyer, 'POST', details, { role: 'admin' })).status, 403);
    for (const override of [{ date: '2026-02-30' }, { capacity: 0 }, { startTime: '25:00' }, { endTime: '12:00' },
      { organizer: '' }, { registrationUrl: 'javascript:alert(1)' }, { attendees: [] }, { registrationDeadline: '2999-01-01' }]) {
      assert.equal((await api('', admin, 'POST', { ...details, ...override })).status, 400);
    }
    const saved = await api('', admin, 'POST', details);
    assert.equal(saved.status, 201);
    event = saved.data;
    assert.equal(event.rsvpOpen, true);
    assert.equal(event.availableSeats, 2);
  });

  await t.test('RSVPs are tied to the signed-in account, remain private, and persist across repeat requests', async () => {
    assert.equal((await api(`/${event.id}/rsvp`, null, 'PUT')).status, 401);
    assert.equal((await api(`/${event.id}/rsvp`, admin, 'PUT')).status, 403);
    assert.equal((await api('/missing-event/rsvp', buyer, 'PUT')).status, 404);
    assert.equal((await api('/event-build-night/rsvp', buyer, 'PUT')).status, 409);
    assert.equal((await api(`/${event.id}/rsvp`, buyer, 'PUT', { userId: String(other._id) })).status, 400);
    const first = await api(`/${event.id}/rsvp`, buyer, 'PUT');
    assert.equal(first.status, 200);
    assert.equal(first.data.myRsvp, 'going');
    assert.equal(first.data.attendeeCount, 1);
    assert.equal(first.data.availableSeats, 1);
    assert.ok(!('attendees' in first.data));
    const retries = await Promise.all([api(`/${event.id}/rsvp`, buyer, 'PUT'), api(`/${event.id}/rsvp`, buyer, 'PUT')]);
    assert.ok(retries.every((response) => response.status === 200 && response.data.attendeeCount === 1));
    assert.equal((await Event.findOne({ id: event.id })).attendees.length, 1);
    assert.equal((await api('', buyer)).data.events.find((item) => item.id === event.id).myRsvp, 'going');
    assert.equal((await api('', other)).data.events.find((item) => item.id === event.id).myRsvp, null);
    assert.equal((await api()).data.events.find((item) => item.id === event.id).myRsvp, null);
    assert.equal((await api(`/${event.id}/attendees`, seller)).status, 403);
    assert.equal((await api(`/${event.id}/attendees`, admin)).data.attendees[0].username, buyer.username);
  });

  await t.test('simultaneous registrations cannot overbook and a full event still allows an unchanged retry', async () => {
    const responses = await Promise.all([seller, other, third].map((user) => api(`/${event.id}/rsvp`, user, 'PUT')));
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal(responses.filter((response) => response.status === 409).length, 2);
    assert.equal((await Event.findOne({ id: event.id })).attendees.length, 2);
    assert.equal((await api(`/${event.id}/rsvp`, buyer, 'PUT')).status, 200);
    assert.equal((await api(`/${event.id}`, admin, 'PUT', { ...details, capacity: 1, expectedRevision: 0 })).status, 409);
  });

  await t.test('cancelling releases only the current account seat and is safe to repeat', async () => {
    const before = (await Event.findOne({ id: event.id })).attendees.length;
    const cancelled = await api(`/${event.id}/rsvp`, buyer, 'DELETE');
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.myRsvp, null);
    assert.equal(cancelled.data.attendeeCount, before - 1);
    assert.equal(cancelled.data.availableSeats, 1);
    assert.equal((await api(`/${event.id}/rsvp`, buyer, 'DELETE')).data.attendeeCount, before - 1);
    const tries = await Promise.all([api(`/${event.id}/rsvp`, buyer, 'PUT'), api(`/${event.id}/rsvp`, buyer, 'PUT')]);
    assert.ok(tries.every((response) => response.status === 200));
    assert.equal((await Event.findOne({ id: event.id })).attendees.length, 2);
  });

  await t.test('closed schedules, deadlines, cancellations and stale admin edits are enforced on the server', async () => {
    const cancelled = await api(`/${event.id}`, admin, 'PUT', { ...details, status: 'cancelled', expectedRevision: 0 });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.revision, 1);
    assert.equal((await api(`/${event.id}`, admin, 'PUT', { ...details, expectedRevision: 0 })).status, 409);
    await api(`/${event.id}/rsvp`, buyer, 'DELETE');
    assert.equal((await api(`/${event.id}/rsvp`, buyer, 'PUT')).status, 409);
    const past = await api('', admin, 'POST', { ...details, date: '2000-01-01' });
    assert.equal((await api(`/${past.data.id}/rsvp`, buyer, 'PUT')).status, 409);
    const expired = await api('', admin, 'POST', { ...details, registrationDeadline: '2000-01-01' });
    assert.equal((await api(`/${expired.data.id}/rsvp`, buyer, 'PUT')).status, 409);
    const removed = new mongoose.Types.ObjectId();
    assert.equal((await api('', { _id: removed, role: 'buyer' })).status, 401);
    assert.equal((await api('', { _id: 'bad-id', role: 'buyer' })).status, 401);
  });

  await t.test('the server supplies Leaflet, marker images and event scripts locally', async () => {
    for (const file of ['store.html', 'events.html', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/images/marker-icon.png', 'js/event-manager.js']) {
      assert.equal((await fetch(`${base}/${file}`)).status, 200);
    }
  });
});
