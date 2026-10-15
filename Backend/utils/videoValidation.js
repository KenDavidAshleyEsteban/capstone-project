const { Transform } = require('stream');
const { InputError } = require('./productValidation');
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const TYPES = ['video/mp4', 'video/webm', 'video/ogg'];
function validateVideo(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Enter video details.');
  if (Object.keys(body).some((key) => !['title', 'grade', 'notes', 'fileName', 'size', 'type'].includes(key))) throw new InputError('Unsupported video field.');
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 80) throw new InputError('Enter a video title up to 80 characters.');
  if (!['EG', 'HG', 'RG', 'MG', 'SD', 'PG', 'Custom'].includes(body.grade)) throw new InputError('Choose a valid build grade.');
  if (typeof body.fileName !== 'string' || !body.fileName.trim() || body.fileName.length > 200) throw new InputError('Enter a valid video filename.');
  if (!TYPES.includes(body.type) || !Number.isInteger(body.size) || body.size < 12 || body.size > MAX_VIDEO_BYTES) throw new InputError('Choose an MP4, WebM, or Ogg video up to 100 MB.');
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 220)) throw new InputError('Build notes must be 220 characters or fewer.');
  return { title: body.title.trim(), grade: body.grade, notes: (body.notes || '').trim(), fileName: body.fileName, size: body.size, type: body.type };
}
function videoGuard(type, expectedSize) {
  let size = 0;
  let prefix = Buffer.alloc(0);
  let checked = false;
  return new Transform({
    transform(chunk, encoding, done) {
      size += chunk.length;
      if (size > MAX_VIDEO_BYTES || size > expectedSize) return done(new InputError('The video exceeds its declared size or the 100 MB limit.'));
      if (!checked) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, Math.max(0, 12 - prefix.length))]);
        if (prefix.length >= 12) {
          checked = true;
          const valid = type === 'video/mp4' ? prefix.toString('ascii', 4, 8) === 'ftyp'
            : type === 'video/webm' ? prefix.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
              : type === 'video/ogg' && prefix.toString('ascii', 0, 4) === 'OggS';
          if (!valid) return done(new InputError('The file contents do not match the selected video format.'));
        }
      }
      done(null, chunk);
    },
    flush(done) { done(size !== expectedSize || !checked ? new InputError('The video upload was incomplete. Please retry.') : null); }
  });
}
module.exports = { validateVideo, videoGuard, MAX_VIDEO_BYTES };
