const express = require('express');
const router = express.Router();
const { getProducts, updateProduct, addProduct } = require('../controllers/productController');
const auth = require('../middleware/auth');
const catalogOwner = require('../middleware/catalogOwner');

router.get('/', getProducts);
router.get('/stock', async (req, res, next) => {
  try {
    const products = await require('../models/Product').find({}).select('_id id name grade skill price stock status storeId updatedAt').lean();
    res.set('Cache-Control', 'no-store').json({ products, checkedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

router.put('/:id', auth, catalogOwner, updateProduct);

router.post('/', auth, catalogOwner, addProduct);

module.exports = router;
