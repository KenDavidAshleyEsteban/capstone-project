const router = require('express').Router();
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const auth = require('../middleware/auth');
const catalogOwner = require('../middleware/catalogOwner');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { validateSale, today } = require('../utils/saleValidation');

router.use(auth, catalogOwner);
const publicSale = (sale) => {
  const data = sale.toObject ? sale.toObject() : { ...sale };
  delete data.fingerprint;
  delete data.requestId;
  return data;
};

router.get('/', async (req, res, next) => {
  try {
    const days = Number(req.query.days || 28);
    if (!Number.isInteger(days) || days < 1 || days > 366) return res.status(400).json({ message: 'Choose a history window from 1 to 366 days.' });
    const start = new Date(`${today()}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - days + 1);
    // Even admins view their own store's sales here; cross-store access is never inferred from a name.
    const sales = await Sale.find({ storeId: String(req.catalogOwner._id), date: { $gte: start.toISOString().slice(0, 10), $lte: today() } }).sort({ date: -1, createdAt: -1 }).lean();
    res.set('Cache-Control', 'no-store').json({ sales: sales.map(publicSale), days });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  let session;
  try {
    const data = validateSale(req.body);
    const owner = req.catalogOwner;
    const storeId = String(owner._id);
    const existing = await Sale.findOne({ storeId, requestId: data.requestId });
    if (existing) {
      if (existing.fingerprint !== data.fingerprint) return res.status(409).json({ message: 'This request already saved a different sale. Check sale history before starting another sale.' });
      return res.json(publicSale(existing));
    }
    let saved;
    const create = async (transaction) => {
      let product;
      if (data.type === 'product') {
        const identity = mongoose.isObjectIdOrHexString(data.productId) ? { $or: [{ _id: data.productId }, { id: data.productId }] } : { id: data.productId };
        product = await Product.findOne({ ...identity, storeId }).session(transaction);
        if (!product) throw Object.assign(new Error('Product not found in your store.'), { status: 404 });
        if (data.deductStock) {
          if (product.stock < data.quantity) throw Object.assign(new Error('Not enough stock. Refresh inventory or leave stock unchanged for a previously recorded stock movement.'), { status: 409 });
          product.stock -= data.quantity;
          if (!['Pre-order', 'Restock Soon'].includes(product.status)) product.status = product.stock === 0 ? 'Out of Stock' : product.stock <= 5 ? 'Low Stock' : 'Available';
          await product.save({ session: transaction });
        }
      }
      const name = product?.name || data.name;
      const amount = Math.round(data.unitPrice * 100) * data.quantity / 100;
      const [sale] = await Sale.create([{
        id: `GH-${randomUUID()}`, requestId: data.requestId, fingerprint: data.fingerprint,
        storeId, store: owner.storeName || `${owner.username}'s store`, createdBy: storeId,
        date: data.date, amount, points: Math.floor(amount / 10), items: `${name} (x${data.quantity})`,
        source: data.type === 'product' ? 'sale' : 'seller-offer', status: 'Completed',
        category: data.category, deductStock: data.deductStock,
        lineItems: [{ productId: product?.id || data.productId, name, grade: product?.grade || '', quantity: data.quantity, unitPrice: data.unitPrice }]
      }], transaction ? { session: transaction } : {});
      saved = sale;
    };
    if (data.deductStock) {
      session = await mongoose.startSession();
      await session.withTransaction(() => create(session));
    } else await create(null);
    res.status(201).json(publicSale(saved));
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Sale.findOne({ storeId: String(req.catalogOwner._id), requestId: req.body.requestId });
      if (existing && existing.fingerprint === validateSale(req.body).fingerprint) return res.json(publicSale(existing));
      return res.status(409).json({ message: 'This sale request was already used. Check sale history before recording another sale.' });
    }
    if (error.code === 20 || /Transaction numbers are only allowed/.test(error.message)) return res.status(503).json({ message: 'Stock-deducting sales need MongoDB Atlas or a replica set. You can record the sale with stock unchanged and update inventory separately.' });
    if ([404, 409].includes(error.status)) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally { if (session) await session.endSession(); }
});

module.exports = router;
