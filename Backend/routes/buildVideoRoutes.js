const router = require('express').Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { pipeline } = require('stream/promises');
const auth = require('../middleware/auth');
const account = require('../middleware/videoAccount');
const User = require('../models/User');
const Video = require('../models/BuildVideo');
const { validateVideo, videoGuard } = require('../utils/videoValidation');
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'buildVideos' });
const idValid = (id) => mongoose.isObjectIdOrHexString(id);
const admin = (req, res, next) => req.videoAccount.role === 'admin' ? next() : res.status(403).json({ message: 'Only admins can review build videos.' });

async function list(req, res, filter, extra = {}) {
  const page = Number(req.query.page || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return res.status(400).json({ message: 'Choose a valid video page.' });
  const limit = 12;
  const [videos, total] = await Promise.all([
    Video.find(filter).select(extra.public ? 'title grade notes builder role size type createdAt status' : extra.review ? '' : '-reviewHistory').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Video.countDocuments(filter)
  ]);
  let counts;
  if (extra.review) {
    const values = await Video.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    counts = Object.fromEntries(values.map((value) => [value._id, value.count]));
  }
  res.set('Cache-Control', 'no-store').json({ videos, total, page, pages: Math.max(1, Math.ceil(total / limit)), ...(counts ? { counts } : {}) });
}

router.get('/', async (req, res, next) => {
  try { await list(req, res, { status: 'approved' }, { public: true }); } catch (error) { next(error); }
});
router.get('/mine', auth, account, async (req, res, next) => {
  try { await list(req, res, { ownerId: String(req.videoAccount._id), status: { $ne: 'removed' } }); } catch (error) { next(error); }
});
router.get('/review', auth, account, admin, async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    if (!['all', 'awaiting-upload', 'uploading', 'pending', 'approved', 'rejected', 'failed', 'removed'].includes(status)) return res.status(400).json({ message: 'Choose a valid upload status.' });
    await list(req, res, status === 'all' ? {} : { status }, { review: true });
  } catch (error) { next(error); }
});

router.post('/', auth, account, async (req, res, next) => {
  try {
    if (!['buyer', 'seller'].includes(req.videoAccount.role)) return res.status(403).json({ message: 'Only buyers and sellers can submit build videos.' });
    const data = validateVideo(req.body);
    const video = await Video.create({ ...data, ownerId: String(req.videoAccount._id), builder: req.videoAccount.username,
      role: req.videoAccount.role, fileId: new mongoose.Types.ObjectId(), status: 'awaiting-upload' });
    res.status(201).json({ id: String(video._id), status: video.status });
  } catch (error) { next(error); }
});

router.put('/:id/content', auth, account, async (req, res, next) => {
  let video;
  let upload;
  let guard;
  let aborted;
  try {
    if (!idValid(req.params.id)) return res.status(404).json({ message: 'Video not found.' });
    video = await Video.findOneAndUpdate({ _id: req.params.id, ownerId: String(req.videoAccount._id), status: 'awaiting-upload' }, { status: 'uploading' }, { returnDocument: 'after' }).select('+fileId');
    if (!video) return res.status(409).json({ message: 'This upload is no longer available. Refresh your uploads before retrying.' });
    if ((req.headers['content-type'] || '').split(';')[0] !== video.type) throw Object.assign(new Error('The upload format does not match the video details.'), { status: 400 });
    if (req.headers['content-length'] && Number(req.headers['content-length']) !== video.size) throw Object.assign(new Error('The upload size does not match the video details.'), { status: 400 });
    guard = videoGuard(video.type, video.size);
    upload = bucket().openUploadStreamWithId(video.fileId, video.fileName, { metadata: { videoId: video._id, type: video.type } });
    aborted = () => guard.destroy(new Error('The upload was interrupted.'));
    req.once('aborted', aborted);
    req.once('error', aborted);
    req.pipe(guard);
    await pipeline(guard, upload);
    const pending = await Video.findOneAndUpdate({ _id: video._id, status: 'uploading' }, { status: 'pending' }, { returnDocument: 'after' });
    if (!pending) {
      await bucket().delete(video.fileId);
      return res.status(409).json({ message: 'This video was withdrawn during upload.' });
    }
    res.json({ id: String(video._id), status: 'pending' });
  } catch (error) {
    if (guard) { req.unpipe(guard); req.resume(); }
    if (upload) await upload.abort().catch(() => {});
    if (video) {
      await mongoose.connection.db.collection('buildVideos.chunks').deleteMany({ files_id: video.fileId });
      await mongoose.connection.db.collection('buildVideos.files').deleteOne({ _id: video.fileId });
      await Video.updateOne({ _id: video._id, status: 'uploading' }, { status: 'failed' });
    }
    next(error);
  } finally {
    if (aborted) { req.removeListener('aborted', aborted); req.removeListener('error', aborted); }
  }
});

router.get('/:id/content', async (req, res, next) => {
  try {
    if (!idValid(req.params.id)) return res.status(404).json({ message: 'Video not found.' });
    const video = await Video.findById(req.params.id).select('+fileId');
    if (!video || !['approved', 'pending', 'rejected'].includes(video.status)) return res.status(404).json({ message: 'Video not available.' });
    if (video.status !== 'approved') {
      let user;
      try {
        const decoded = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), process.env.JWT_SECRET);
        user = await User.findById(decoded.id).select('role');
      } catch { /* Pending and rejected content stays private. */ }
      if (!user || (user.role !== 'admin' && String(user._id) !== video.ownerId)) return res.status(404).json({ message: 'Video not available.' });
    }
    const [file] = await bucket().find({ _id: video.fileId }).limit(1).toArray();
    if (!file) return res.status(404).json({ message: 'Video file not found.' });
    let start = 0;
    let end = file.length - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) return res.status(416).set('Content-Range', `bytes */${file.length}`).end();
      start = match[1] ? Number(match[1]) : Math.max(0, file.length - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= file.length) return res.status(416).set('Content-Range', `bytes */${file.length}`).end();
      res.status(206).set('Content-Range', `bytes ${start}-${end}/${file.length}`);
    }
    res.set({ 'Content-Type': video.type, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    const stream = bucket().openDownloadStream(video.fileId, { start, end: end + 1 });
    stream.on('error', (error) => res.headersSent ? res.destroy(error) : next(error));
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) { next(error); }
});

router.patch('/:id/review', auth, account, admin, async (req, res, next) => {
  try {
    const { decision, note = '' } = req.body || {};
    if (!['approved', 'rejected'].includes(decision) || typeof note !== 'string' || note.length > 500
      || (decision === 'rejected' && !note.trim())) return res.status(400).json({ message: 'Choose approve or reject. Rejections need a reason up to 500 characters.' });
    if (!idValid(req.params.id)) return res.status(404).json({ message: 'Video not found.' });
    const at = new Date();
    const video = await Video.findOneAndUpdate({ _id: req.params.id, status: { $in: ['pending', 'approved', 'rejected'] } }, {
      $set: { status: decision, reviewNote: note.trim(), reviewedAt: at, reviewer: req.videoAccount.username },
      $push: { reviewHistory: { decision, note: note.trim(), at, reviewer: req.videoAccount.username, reviewerId: String(req.videoAccount._id) } }
    }, { returnDocument: 'after' });
    if (!video) return res.status(409).json({ message: 'The video is not ready for review or has been withdrawn. Refresh the queue.' });
    res.json({ id: String(video._id), status: video.status, reviewedAt: at });
  } catch (error) { next(error); }
});

router.delete('/:id', auth, account, async (req, res, next) => {
  try {
    if (!idValid(req.params.id)) return res.status(404).json({ message: 'Video not found.' });
    const filter = { _id: req.params.id, ...(req.videoAccount.role === 'admin' ? {} : { ownerId: String(req.videoAccount._id) }) };
    const video = await Video.findOneAndUpdate(filter, { status: 'removed' });
    if (!video) return res.status(404).json({ message: 'Video not found.' });
    res.json({ message: 'Video withdrawn from the gallery and review queue.' });
  } catch (error) { next(error); }
});

module.exports = router;
