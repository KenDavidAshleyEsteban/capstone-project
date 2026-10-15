const { InputError } = require('./productValidation');

const stringFields = {
  title: 160, type: 60, description: 3000, venue: 160, address: 300, organizer: 160,
  contactEmail: 200, contactPhone: 40, audience: 500, registrationUrl: 1000,
  accessibility: 1000, rules: 2000, cancellationPolicy: 2000
};
const dateFields = ['date', 'registrationDeadline'];
const timeFields = ['startTime', 'endTime'];
const listFields = ['agenda', 'bring', 'included'];
const editableFields = [...Object.keys(stringFields), ...dateFields, ...timeFields, ...listFields, 'status', 'fee', 'capacity'];
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function validateEvent(body, updating = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Enter event details.');
  const allowed = [...editableFields, ...(updating ? ['expectedRevision'] : [])];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new InputError('Unsupported event field.');
  if (updating && (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0)) throw new InputError('Refresh the event before editing it.');
  const data = {};
  for (const [field, limit] of Object.entries(stringFields)) {
    const value = body[field] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw new InputError(`Check the event ${field}.`);
    data[field] = value.trim();
  }
  for (const field of ['title', 'type', 'description']) if (!data[field]) throw new InputError(`Event ${field} is required.`);
  data.status = body.status || 'sample';
  if (!['sample', 'confirmed', 'cancelled'].includes(data.status)) throw new InputError('Choose a valid event status.');
  for (const field of dateFields) {
    data[field] = body[field] || null;
    if (data[field] !== null && !validDate(data[field])) throw new InputError(`Enter a valid ${field} (YYYY-MM-DD).`);
  }
  for (const field of timeFields) {
    data[field] = body[field] || null;
    if (data[field] !== null && (typeof data[field] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data[field]))) throw new InputError(`Enter a valid ${field}.`);
  }
  if (data.startTime && data.endTime && data.endTime <= data.startTime) throw new InputError('The end time must be after the start time on the same day.');
  if (data.registrationDeadline && data.date && data.registrationDeadline > data.date) throw new InputError('Registration must close on or before the event date.');
  for (const field of listFields) {
    const value = body[field] ?? [];
    if (!Array.isArray(value) || value.length > 30 || value.some((item) => typeof item !== 'string' || item.length > 300)) throw new InputError(`Enter up to 30 short ${field} items.`);
    data[field] = value.map((item) => item.trim()).filter(Boolean);
  }
  data.fee = body.fee ?? null;
  if (data.fee !== null && (typeof data.fee !== 'number' || !Number.isFinite(data.fee) || data.fee < 0 || data.fee > 1000000)) throw new InputError('Enter a valid admission fee (0 for free).');
  if (data.fee !== null) data.fee = Math.round(data.fee * 100) / 100;
  data.capacity = body.capacity ?? null;
  if (data.capacity !== null && (!Number.isInteger(data.capacity) || data.capacity < 1 || data.capacity > 10000)) throw new InputError('Capacity must be a whole number from 1 to 10,000.');
  if (data.registrationUrl) {
    let url;
    try { url = new URL(data.registrationUrl); } catch { throw new InputError('Enter a valid registration URL.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new InputError('Use an HTTP or HTTPS registration URL.');
    data.registrationUrl = url.href;
  }
  if (data.contactEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.contactEmail)) throw new InputError('Enter a valid organizer email.');
  if (data.contactPhone && (!/^\+?[\d ()-]+$/.test(data.contactPhone) || data.contactPhone.replace(/\D/g, '').length < 7)) throw new InputError('Enter a valid organizer phone number.');
  if (data.status === 'confirmed' && (!data.date || !data.startTime || !data.endTime || !data.venue || !data.address || !data.organizer || data.capacity === null || data.fee === null)) {
    throw new InputError('Confirmed events need a date, start/end times, venue, address, organizer, capacity, and admission fee.');
  }
  return data;
}

function rsvpState(event, now = new Date()) {
  const count = event.attendees?.length || 0;
  const availableSeats = Number.isInteger(event.capacity) ? Math.max(0, event.capacity - count) : null;
  let closedReason = '';
  if (event.status === 'cancelled') closedReason = 'This event has been cancelled.';
  else if (event.status !== 'confirmed' || !validDate(event.date) || !event.startTime || !Number.isInteger(event.capacity)) closedReason = 'RSVP opens when the event schedule and capacity are confirmed.';
  else if (now.getTime() >= new Date(`${event.date}T${event.startTime}:00+08:00`).getTime()) closedReason = 'This event has already started. RSVPs are closed.';
  else if (event.registrationDeadline && now.getTime() > new Date(`${event.registrationDeadline}T23:59:59.999+08:00`).getTime()) closedReason = 'The registration deadline has passed.';
  else if (availableSeats === 0) closedReason = 'This event is fully booked.';
  return { attendeeCount: count, availableSeats, rsvpOpen: !closedReason, closedReason };
}

function publicEvent(event, userId, now) {
  const value = event.toObject ? event.toObject() : event;
  return Object.fromEntries([
    ...['id', ...editableFields, 'revision', 'createdAt', 'updatedAt'].map((key) => [key, value[key]]),
    ...Object.entries(rsvpState(value, now)),
    ['myRsvp', userId && value.attendees?.some((entry) => String(entry.userId) === String(userId)) ? 'going' : null]
  ]);
}

module.exports = { validateEvent, publicEvent, rsvpState };
