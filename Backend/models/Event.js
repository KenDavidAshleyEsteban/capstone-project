const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const eventSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true, default: () => `event-${randomUUID()}` },
  title: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, enum: ['sample', 'confirmed', 'cancelled'], default: 'sample' },
  description: { type: String, required: true },
  date: { type: String, default: null },
  startTime: { type: String, default: null },
  endTime: { type: String, default: null },
  venue: String, address: String, organizer: String, contactEmail: String, contactPhone: String,
  fee: { type: Number, default: null },
  capacity: { type: Number, default: null },
  audience: String, registrationDeadline: { type: String, default: null }, registrationUrl: String,
  agenda: [String], bring: [String], included: [String], accessibility: String, rules: String, cancellationPolicy: String,
  revision: { type: Number, default: 0 },
  attendees: [{ _id: false, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, joinedAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
