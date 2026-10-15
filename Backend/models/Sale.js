const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  requestId: { type: String, required: true },
  storeId: { type: String, required: true, index: true },
  store: { type: String, required: true },
  createdBy: { type: String, required: true },
  date: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  points: { type: Number, required: true },
  items: { type: String, required: true },
  source: { type: String, enum: ['sale', 'seller-offer'], required: true },
  status: { type: String, default: 'Completed' },
  category: String,
  deductStock: { type: Boolean, required: true },
  lineItems: [{ _id: false, productId: String, name: String, grade: String, quantity: Number, unitPrice: Number }],
  fingerprint: { type: String, required: true }
}, { timestamps: true });
saleSchema.index({ storeId: 1, requestId: 1 }, { unique: true });
module.exports = mongoose.model('Sale', saleSchema);
