const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');
const { validateProduct, InputError } = require('../utils/productValidation');

const catalogScope = (user) => user.role === 'admin' ? {} : { storeId: String(user._id) };

async function getProducts(req, res, next) {
  try {
    res.json(await Product.find({}).sort({ createdAt: -1, _id: -1 }));
  } catch (error) { next(error); }
}

async function validateStore(storeId, user, existing) {
  if (user.role !== 'admin') {
    if (storeId !== String(user._id)) throw new InputError('Products must belong to your store.', 'storeId');
    return;
  }
  // Preserve legacy store slugs on existing products. New assignments use account IDs.
  if (existing && storeId === existing.storeId) return;
  const owner = mongoose.isObjectIdOrHexString(storeId)
    ? await User.findOne({ _id: storeId, role: { $in: ['seller', 'admin'] } }) : null;
  if (!owner) throw new InputError('Choose an existing store owner.', 'storeId');
}

async function addProduct(req, res, next) {
  try {
    const user = req.catalogOwner;
    const body = { ...req.body };
    if (user.role === 'seller') {
      if (body.storeId && body.storeId !== String(user._id)) throw new InputError('Products must belong to your store.', 'storeId');
      body.storeId = String(user._id);
    } else body.storeId ??= String(user._id);
    const data = validateProduct(body);
    await validateStore(data.storeId, user);
    const product = await Product.create(data);
    res.status(201).json(product);
  } catch (error) { next(error); }
}

async function updateProduct(req, res, next) {
  try {
    const id = req.params.id;
    const identity = mongoose.isObjectIdOrHexString(id) ? { $or: [{ _id: id }, { id }] } : { id };
    const product = await Product.findOne({ ...identity, ...catalogScope(req.catalogOwner) });
    if (!product) return res.status(404).json({ message: 'Product not found in your catalog.' });
    const data = validateProduct(req.body, product);
    await validateStore(data.storeId, req.catalogOwner, product);
    Object.assign(product, data);
    res.json(await product.save());
  } catch (error) { next(error); }
}

module.exports = { getProducts, addProduct, updateProduct, catalogScope };
