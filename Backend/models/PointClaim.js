const mongoose = require('mongoose');
const claimSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  receiptId: { type: String, required: true, unique: true },
  buyerId: { type: String, required: true, index: true },
  points: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  store: { type: String, required: true },
  date: { type: String, required: true }
}, { timestamps: true });
module.exports = mongoose.model('PointClaim', claimSchema);
