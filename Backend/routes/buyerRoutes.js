const router = require('express').Router();
const mongoose = require('mongoose');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const qrcode = require('qrcode-generator');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Reservation = require('../models/Reservation');
const BuyerReceipt = require('../models/BuyerReceipt');
const LoyaltyWallet = require('../models/LoyaltyWallet');
const PointClaim = require('../models/PointClaim');
const RewardRedemption = require('../models/RewardRedemption');
const Sale = require('../models/Sale');
const { inventoryStatus } = require('../utils/productValidation');
const { today } = require('../utils/saleValidation');
const { receiptToken, receiptNonce } = require('../utils/receiptToken');
const rewards = require('../utils/rewardCatalog');

const fail = (status, message) => Object.assign(new Error(message), { status });
const route = (handler) => async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (error) {
    if (error.code === 20 || /Transaction numbers are only allowed/.test(error.message)) return res.status(503).json({ message: 'Reservations and points require MongoDB Atlas or a local replica set.' });
    if (error.status && error.status >= 400 && error.status < 600) return res.status(error.status).json({ message: error.message });
    next(error);
  }
};
const fields = (body, allowed) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) throw fail(400, 'Unsupported request details.');
};
const requestId = (value) => {
  if (typeof value !== 'string' || !/^[\w-]{16,100}$/.test(value)) throw fail(400, 'A valid request ID is required.');
  return value;
};
const publicReservation = (row) => ({
  id: row.id, buyerId: row.buyerId, customer: row.customer, productId: row.productId,
  name: row.name, image: row.image, grade: row.grade, storeId: row.storeId, store: row.store,
  quantity: row.quantity, unitPrice: row.unitPrice, amount: row.amount, status: row.status,
  createdAt: row.createdAt, completedAt: row.completedAt, cancelledAt: row.cancelledAt
});
const publicReceipt = (row) => ({
  id: row.id, reservationId: row.reservationId, storeId: row.storeId, store: row.store,
  date: row.date, amount: row.amount, points: row.points, items: row.items, status: 'Completed',
  claimed: Boolean(row.claimedAt), claimedAt: row.claimedAt,
  ...(!row.claimedAt && row.qrNonce ? { qrToken: receiptToken(row.qrNonce) } : {})
});
const publicClaim = (row) => ({ id: row.id, receiptId: row.receiptId, points: row.points, store: row.store, date: row.date, type: 'earn' });
const publicRedemption = (row) => ({ id: row.id, rewardId: row.rewardId, title: row.title, cost: row.cost, store: row.store, status: row.status, date: row.date, code: row.code });
async function transaction(work) {
  // A concurrent idempotent retry may hit a unique index before seeing the winner.
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => { result = await work(session); });
      return result;
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    } finally { await session.endSession(); }
  }
}
router.use(auth, route(async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.user.id)) throw fail(401, 'Sign in again to access your account.');
  const user = await User.findById(req.user.id).select('username role storeName isVerified');
  if (!user) throw fail(401, 'Your account is no longer available. Sign in again.');
  if (!user.isVerified) throw fail(403, 'Verify your email before using reservations or points.');
  req.commerceUser = user;
  res.set('Cache-Control', 'no-store');
  next();
}));
const buyer = (req) => {
  if (req.commerceUser.role !== 'buyer') throw fail(403, 'A buyer account is required.');
  return String(req.commerceUser._id);
};
const storeOwner = (req) => {
  if (!['seller', 'admin'].includes(req.commerceUser.role)) throw fail(403, 'A store owner or admin account is required.');
  return String(req.commerceUser._id);
};

router.get('/summary', route(async (req, res) => {
  const buyerId = buyer(req);
  const [reservations, receipts, wallet, claims, redemptions] = await Promise.all([
    Reservation.find({ buyerId }).sort({ createdAt: -1 }).lean(),
    BuyerReceipt.find({ buyerId }).select('+qrNonce').sort({ createdAt: -1 }).lean(),
    LoyaltyWallet.findOne({ buyerId }).lean(),
    PointClaim.find({ buyerId }).sort({ createdAt: -1 }).lean(),
    RewardRedemption.find({ buyerId }).sort({ createdAt: -1 }).lean()
  ]);
  res.json({ accountId: buyerId, balance: wallet?.balance || 0, reservations: reservations.map(publicReservation), receipts: receipts.map(publicReceipt), transactions: claims.map(publicClaim), redemptions: redemptions.map(publicRedemption) });
}));
router.get('/rewards', route(async (req, res) => { buyer(req); res.json({ rewards }); }));
router.get('/receipts/:id/qr', route(async (req, res) => {
  const buyerId = buyer(req);
  const receipt = await BuyerReceipt.findOne({ id: req.params.id, buyerId }).select('+qrNonce');
  if (!receipt) throw fail(404, 'Receipt not found.');
  if (receipt.claimedAt) throw fail(409, 'The points from this receipt have already been claimed.');
  const qr = qrcode(0, 'M');
  qr.addData(receiptToken(receipt.qrNonce));
  qr.make();
  res.type('image/svg+xml').send(qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }));
}));
router.get('/store/reservations', route(async (req, res) => {
  const storeId = storeOwner(req);
  const reservations = await Reservation.find(req.commerceUser.role === 'admin' ? {} : { storeId }).sort({ createdAt: -1 }).lean();
  res.json({ reservations: reservations.map(publicReservation) });
}));
router.post('/reservations', route(async (req, res) => {
  const buyerId = buyer(req);
  fields(req.body, ['productId', 'quantity', 'requestId']);
  const key = requestId(req.body.requestId);
  if (typeof req.body.productId !== 'string' || !req.body.productId || req.body.productId.length > 100) throw fail(400, 'Choose a catalog product.');
  if (!Number.isSafeInteger(req.body.quantity) || req.body.quantity < 1 || req.body.quantity > 100) throw fail(400, 'Choose a whole quantity from 1 to 100.');
  const fingerprint = createHash('sha256').update(JSON.stringify([req.body.productId, req.body.quantity])).digest('hex');
  const result = await transaction(async (session) => {
    const existing = await Reservation.findOne({ buyerId, requestId: key }).session(session);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw fail(409, 'This request already reserved a different quantity or product.');
      return { reservation: existing, created: false };
    }
    const identity = mongoose.isObjectIdOrHexString(req.body.productId) ? { $or: [{ _id: req.body.productId }, { id: req.body.productId }] } : { id: req.body.productId };
    const product = await Product.findOne(identity).session(session);
    if (!product) throw fail(404, 'This product is no longer available.');
    if (product.stock < req.body.quantity || ['Pre-order', 'Restock Soon'].includes(product.status)) throw fail(409, 'Not enough stock is available for pickup. Refresh the catalog.');
    const owner = mongoose.isObjectIdOrHexString(product.storeId) && await User.findById(product.storeId).session(session);
    if (!owner?.isVerified || !['seller', 'admin'].includes(owner.role)) throw fail(409, 'This store is not accepting reservations.');
    product.stock -= req.body.quantity;
    product.status = inventoryStatus(product.stock, product.status);
    await product.save({ session });
    const [reservation] = await Reservation.create([{
      id: `RSV-${randomUUID()}`, buyerId, customer: req.commerceUser.username,
      storeId: product.storeId, store: owner.storeName || `${owner.username}'s store`,
      productObjectId: product._id, productId: product.id, name: product.name, image: product.image, grade: product.grade,
      quantity: req.body.quantity, unitPrice: product.price, amount: Math.round(product.price * 100) * req.body.quantity / 100,
      requestId: key, fingerprint
    }], { session });
    return { reservation, created: true };
  });
  res.status(result.created ? 201 : 200).json(publicReservation(result.reservation));
}));
router.patch('/reservations/:id', route(async (req, res) => {
  fields(req.body, ['status']);
  if (!['Cancelled', 'Completed'].includes(req.body.status)) throw fail(400, 'Choose a valid reservation status.');
  const user = req.commerceUser;
  if (req.body.status === 'Completed') storeOwner(req);
  const access = user.role === 'admin' ? {} : user.role === 'seller' ? { storeId: String(user._id) } : { buyerId: String(user._id) };
  const reservation = await transaction(async (session) => {
    const row = await Reservation.findOne({ id: req.params.id, ...access }).session(session);
    if (!row) throw fail(404, 'Reservation not found.');
    if (row.status === req.body.status) return row;
    if (row.status !== 'Reserved') throw fail(409, 'This reservation is already completed or cancelled.');
    if (req.body.status === 'Cancelled') {
      const product = await Product.findById(row.productObjectId).session(session);
      if (!product) throw fail(409, 'The reserved product needs a store inventory review before cancellation.');
      product.stock += row.quantity;
      product.status = inventoryStatus(product.stock, product.status);
      await product.save({ session });
      row.cancelledAt = new Date();
    } else {
      const saleId = `GH-${randomUUID()}`;
      const date = today();
      const points = Math.floor(row.amount / 10);
      const items = `${row.name} (x${row.quantity})`;
      await Sale.create([{
        id: saleId, requestId: `reservation-${row.id}`, fingerprint: createHash('sha256').update(row.id).digest('hex'),
        storeId: row.storeId, store: row.store, createdBy: String(user._id), date, amount: row.amount, points, items,
        source: 'sale', status: 'Completed', category: 'Kit', deductStock: false,
        lineItems: [{ productId: row.productId, name: row.name, grade: row.grade, quantity: row.quantity, unitPrice: row.unitPrice }]
      }], { session });
      await BuyerReceipt.create([{
        id: `RCP-${randomUUID()}`, reservationId: row.id, saleId, buyerId: row.buyerId, storeId: row.storeId,
        store: row.store, date, amount: row.amount, points, items, qrNonce: randomBytes(32).toString('base64url')
      }], { session });
      row.completedAt = new Date();
    }
    row.status = req.body.status;
    await row.save({ session });
    return row;
  });
  res.json(publicReservation(reservation));
}));
router.post('/claims', route(async (req, res) => {
  const buyerId = buyer(req);
  fields(req.body, ['token', 'requestId']);
  if (req.body.requestId !== undefined) requestId(req.body.requestId);
  const nonce = receiptNonce(req.body.token);
  const result = await transaction(async (session) => {
    const receipt = await BuyerReceipt.findOne({ buyerId, qrNonce: nonce }).session(session);
    if (!receipt) throw fail(404, 'Receipt not found for your account.');
    const prior = await PointClaim.findOne({ receiptId: receipt.id, buyerId }).session(session);
    if (prior) {
      const wallet = await LoyaltyWallet.findOne({ buyerId }).session(session);
      return { receipt, claim: prior, balance: wallet?.balance || 0, created: false };
    }
    if (receipt.claimedAt) throw fail(409, 'The points from this receipt have already been claimed.');
    const [claim] = await PointClaim.create([{
      id: `PNT-${randomUUID()}`, buyerId, receiptId: receipt.id, points: receipt.points, store: receipt.store, date: today()
    }], { session });
    const wallet = await LoyaltyWallet.findOneAndUpdate({ buyerId }, {
      $inc: { balance: receipt.points, lifetimeEarned: receipt.points }, $setOnInsert: { buyerId, lifetimeSpent: 0 }
    }, { returnDocument: 'after', upsert: true, session, runValidators: true, setDefaultsOnInsert: false });
    receipt.claimedAt = new Date();
    await receipt.save({ session });
    return { receipt, claim, balance: wallet.balance, created: true };
  });
  res.status(result.created ? 201 : 200).json({ receipt: publicReceipt(result.receipt), transaction: publicClaim(result.claim), balance: result.balance });
}));
router.post('/redemptions', route(async (req, res) => {
  const buyerId = buyer(req);
  fields(req.body, ['rewardId', 'requestId']);
  const key = requestId(req.body.requestId);
  if (typeof req.body.rewardId !== 'string') throw fail(400, 'Choose a reward.');
  const reward = rewards.find((item) => item.id === req.body.rewardId);
  if (!reward) throw fail(404, 'Reward not found.');
  const result = await transaction(async (session) => {
    const existing = await RewardRedemption.findOne({ buyerId, requestId: key }).session(session);
    if (existing) {
      if (existing.rewardId !== reward.id) throw fail(409, 'This request already redeemed a different reward.');
      const wallet = await LoyaltyWallet.findOne({ buyerId }).session(session);
      return { redemption: existing, balance: wallet?.balance || 0, created: false };
    }
    const wallet = await LoyaltyWallet.findOneAndUpdate({ buyerId, balance: { $gte: reward.cost } }, {
      $inc: { balance: -reward.cost, lifetimeSpent: reward.cost }
    }, { returnDocument: 'after', session, runValidators: true });
    if (!wallet) throw fail(409, 'You do not have enough points for this reward.');
    const [redemption] = await RewardRedemption.create([{
      id: `RWD-${randomUUID()}`, buyerId, requestId: key, rewardId: reward.id, title: reward.title,
      cost: reward.cost, store: reward.store, date: today(), code: randomBytes(12).toString('hex').toUpperCase()
    }], { session });
    return { redemption, balance: wallet.balance, created: true };
  });
  res.status(result.created ? 201 : 200).json({ redemption: publicRedemption(result.redemption), balance: result.balance });
}));
module.exports = router;
