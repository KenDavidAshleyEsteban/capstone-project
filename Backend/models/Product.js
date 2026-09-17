const mongoose = require('mongoose');
const { GRADES, SKILLS, STATUSES } = require('../utils/productValidation');

const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  grade: { type: String, required: true, enum: GRADES },
  skill: { type: String, required: true, enum: SKILLS },
  price: { type: Number, required: true, min: 0, max: 10000000 },
  stock: { type: Number, required: true, min: 0, max: 1000000, validate: Number.isInteger },
  status: { type: String, required: true, enum: STATUSES },
  image: { type: String, required: true },
  description: { type: String, maxlength: 3000 },
  storeId: { type: String, required: true, index: true }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Product', productSchema, 'products');
