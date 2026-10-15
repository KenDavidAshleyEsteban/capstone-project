const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rsvpState } = require('../utils/eventValidation');

test('RSVP deadlines and start times use Philippine time at their exact boundaries', () => {
  const event = { status: 'confirmed', date: '2026-10-17', startTime: '13:00', capacity: 10, registrationDeadline: '2026-10-15', attendees: [] };
  assert.equal(rsvpState(event, new Date('2026-10-15T15:59:59.999Z')).rsvpOpen, true);
  assert.match(rsvpState(event, new Date('2026-10-15T16:00:00Z')).closedReason, /deadline/);
  delete event.registrationDeadline;
  assert.equal(rsvpState(event, new Date('2026-10-17T04:59:59.999Z')).rsvpOpen, true);
  assert.match(rsvpState(event, new Date('2026-10-17T05:00:00Z')).closedReason, /already started/);
});
