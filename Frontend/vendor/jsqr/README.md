# jsQR

`jsQR.js` is the unmodified browser distribution from npm package `jsqr@1.4.0`
(`dist/jsQR.js`). Its Apache-2.0 license is included in `LICENSE`.

The receipt scanner uses this local copy to decode camera frames and uploaded
QR images without depending on a CDN. The backend generates receipt QR SVGs
with `qrcode-generator`; receipt ownership and claims are checked by the API.
