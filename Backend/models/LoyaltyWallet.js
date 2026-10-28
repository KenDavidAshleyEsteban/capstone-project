const mongoose = require('mongoose');
const walletSchema = new mongoose.Schema({
  buyerId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  lifetimeEarned: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  lifetimeSpent: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger }
}, { timestamps: true });
module.exports = mongoose.model('LoyaltyWallet', walletSchema);
