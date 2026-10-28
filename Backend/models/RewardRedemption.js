const mongoose = require('mongoose');
const redemptionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  buyerId: { type: String, required: true, index: true },
  requestId: { type: String, required: true },
  rewardId: { type: String, required: true },
  title: { type: String, required: true },
  store: { type: String, required: true },
  cost: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  status: { type: String, enum: ['Ready for pickup'], default: 'Ready for pickup' },
  date: { type: String, required: true },
  code: { type: String, required: true, unique: true }
}, { timestamps: true });
redemptionSchema.index({ buyerId: 1, requestId: 1 }, { unique: true });
module.exports = mongoose.model('RewardRedemption', redemptionSchema);
