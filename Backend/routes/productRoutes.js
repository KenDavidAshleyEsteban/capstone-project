const express = require('express');
const router = express.Router();
const { getProducts, updateProduct, addProduct } = require('../controllers/productController');
const auth = require('../middleware/auth');
const catalogOwner = require('../middleware/catalogOwner');

router.get('/', getProducts);

router.put('/:id', auth, catalogOwner, updateProduct);

router.post('/', auth, catalogOwner, addProduct);

module.exports = router;
