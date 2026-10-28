const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  buyerId: { type: String, required: true, index: true },
  customer: { type: String, required: true },
  storeId: { type: String, required: true, index: true },
  store: { type: String, required: true },
  productObjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  productId: { type: String, required: true },
  name: { type: String, required: true },
  image: String,
  grade: String,
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  unitPrice: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Reserved', 'Completed', 'Cancelled'], default: 'Reserved' },
  requestId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  completedAt: Date,
  cancelledAt: Date
}, { timestamps: true });
reservationSchema.index({ buyerId: 1, requestId: 1 }, { unique: true });
module.exports = mongoose.model('Reservation', reservationSchema);
