const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Event = require('../models/Event');
const { validateEvent, publicEvent, rsvpState } = require('../utils/eventValidation');

async function account(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.user?.id)) return res.status(401).json({ message: 'Sign in again to manage RSVPs.' });
    req.eventAccount = await User.findById(req.user.id).select('username role');
    if (!req.eventAccount) return res.status(401).json({ message: 'Your account is no longer available. Sign in again.' });
    next();
  } catch (error) { next(error); }
}
const roles = (...allowed) => (req, res, next) => allowed.includes(req.eventAccount.role) ? next() : res.status(403).json({ message: 'This account cannot perform that event action.' });
router.param('id', (req, res, next, id) => /^[\w-]{1,80}$/.test(id) ? next() : res.status(404).json({ message: 'Event not found.' }));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/', (req, res, next) => req.headers.authorization ? auth(req, res, () => account(req, res, next)) : next(), async (req, res, next) => {
  try {
    const events = await Event.find().sort({ date: 1, createdAt: 1 }).lean();
    res.json({ events: events.map((event) => publicEvent(event, req.eventAccount?._id)), canManage: req.eventAccount?.role === 'admin' });
  } catch (error) { next(error); }
});

router.post('/', auth, account, roles('admin'), async (req, res, next) => {
  try { res.status(201).json(publicEvent(await Event.create(validateEvent(req.body)))); }
  catch (error) { next(error); }
});

router.put('/:id', auth, account, roles('admin'), async (req, res, next) => {
  try {
    const data = validateEvent(req.body, true);
    const event = await Event.findOneAndUpdate({ id: req.params.id, revision: req.body.expectedRevision,
      ...(data.capacity === null ? {} : { $expr: { $lte: [{ $size: '$attendees' }, data.capacity] } })
    }, { $set: data, $inc: { revision: 1 } }, { returnDocument: 'after' });
    if (!event) {
      const existing = await Event.findOne({ id: req.params.id }).lean();
      if (!existing) return res.status(404).json({ message: 'Event not found.' });
      return res.status(409).json({ message: existing.revision !== req.body.expectedRevision ? 'This event changed. Reload events before saving again.' : 'Capacity cannot be lower than the current RSVP count.' });
    }
    res.json(publicEvent(event));
  } catch (error) { next(error); }
});

router.put('/:id/rsvp', auth, account, roles('buyer', 'seller'), async (req, res, next) => {
  try {
    if (req.body && Object.keys(req.body).length) return res.status(400).json({ message: 'An RSVP is always saved for the signed-in account; do not supply attendee details.' });
    const userId = req.eventAccount._id;
    const event = await Event.findOne({ id: req.params.id }).lean();
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    if (event.attendees.some((entry) => String(entry.userId) === String(userId))) return res.json(publicEvent(event, userId));
    const state = rsvpState(event);
    if (!state.rsvpOpen) return res.status(409).json({ message: state.closedReason, event: publicEvent(event, userId) });
    // One atomic document update prevents duplicate attendees and overbooking, including on standalone MongoDB.
    const saved = await Event.findOneAndUpdate({ id: event.id, revision: event.revision, status: 'confirmed',
      'attendees.userId': { $ne: userId }, $expr: { $and: [
        { $lt: [{ $size: '$attendees' }, '$capacity'] },
        { $lt: ['$$NOW', new Date(`${event.date}T${event.startTime}:00+08:00`)] },
        ...(event.registrationDeadline ? [{ $lte: ['$$NOW', new Date(`${event.registrationDeadline}T23:59:59.999+08:00`)] }] : [])
      ] }
    }, { $push: { attendees: { userId, joinedAt: new Date() } } }, { returnDocument: 'after' });
    if (saved) return res.json(publicEvent(saved, userId));
    const latest = await Event.findOne({ id: event.id }).lean();
    if (!latest) return res.status(404).json({ message: 'Event not found.' });
    const result = publicEvent(latest, userId);
    if (result.myRsvp) return res.json(result);
    res.status(409).json({ message: result.closedReason || 'The event changed while booking. Check the latest details and try again.', event: result });
  } catch (error) { next(error); }
});

router.delete('/:id/rsvp', auth, account, roles('buyer', 'seller'), async (req, res, next) => {
  try {
    const event = await Event.findOneAndUpdate({ id: req.params.id }, { $pull: { attendees: { userId: req.eventAccount._id } } }, { returnDocument: 'after' });
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    res.json(publicEvent(event, req.eventAccount._id));
  } catch (error) { next(error); }
});

router.get('/:id/attendees', auth, account, roles('admin'), async (req, res, next) => {
  try {
    const event = await Event.findOne({ id: req.params.id }).populate('attendees.userId', 'username').lean();
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    res.json({ title: event.title, attendees: event.attendees.map((entry) => ({ username: entry.userId?.username || 'Deleted account', joinedAt: entry.joinedAt })) });
  } catch (error) { next(error); }
});

module.exports = router;
