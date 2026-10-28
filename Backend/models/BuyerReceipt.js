const mongoose = require('mongoose');
const receiptSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  reservationId: { type: String, required: true, unique: true },
  saleId: { type: String, required: true, unique: true },
  buyerId: { type: String, required: true, index: true },
  storeId: { type: String, required: true },
  store: { type: String, required: true },
  date: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  points: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  items: { type: String, required: true },
  qrNonce: { type: String, required: true, unique: true, select: false },
  claimedAt: Date
}, { timestamps: true });
module.exports = mongoose.model('BuyerReceipt', receiptSchema);
