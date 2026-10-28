const { createHmac, timingSafeEqual } = require('node:crypto');

function signature(nonce) {
  const secret = process.env.RECEIPT_QR_SECRET || process.env.JWT_SECRET;
  if (!secret) throw Object.assign(new Error('Receipt verification is not configured.'), { status: 503 });
  return createHmac('sha256', secret).update(`gunpla-receipt:v1:${nonce}`).digest('base64url');
}
function receiptToken(nonce) { return `gh1.${nonce}.${signature(nonce)}`; }
function receiptNonce(token) {
  const match = typeof token === 'string' && /^gh1\.([\w-]{43})\.([\w-]{43})$/.exec(token);
  if (!match) throw Object.assign(new Error('Scan a valid Gunpla Hub receipt QR code.'), { status: 400 });
  if (!timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(match[1])))) throw Object.assign(new Error('This receipt QR code could not be verified.'), { status: 400 });
  return match[1];
}
module.exports = { receiptToken, receiptNonce };
