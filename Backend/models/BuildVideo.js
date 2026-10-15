const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  builder: { type: String, required: true },
  role: { type: String, required: true },
  title: { type: String, required: true, maxlength: 80 },
  grade: { type: String, required: true },
  notes: { type: String, maxlength: 220 },
  fileName: { type: String, required: true, maxlength: 200 },
  size: { type: Number, required: true },
  type: { type: String, required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true, select: false },
  status: { type: String, enum: ['awaiting-upload', 'uploading', 'pending', 'approved', 'rejected', 'failed', 'removed'], default: 'awaiting-upload', index: true },
  reviewNote: { type: String, default: '', maxlength: 500 },
  reviewedAt: Date,
  reviewer: String,
  reviewHistory: [{ _id: false, decision: String, note: String, reviewer: String, reviewerId: String, at: Date }]
}, { timestamps: true });
module.exports = mongoose.model('BuildVideo', schema);
