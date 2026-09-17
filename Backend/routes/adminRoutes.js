const router = require('express').Router();
const auth = require('../middleware/auth');
const catalogOwner = require('../middleware/catalogOwner');
const Product = require('../models/Product');
const User = require('../models/User');
const { catalogScope } = require('../controllers/productController');

router.get('/dashboard', auth, catalogOwner, async (req, res, next) => {
  try {
    const user = req.catalogOwner;
    const [products, owners, totalUsers] = await Promise.all([
      Product.find(catalogScope(user)).sort({ createdAt: -1, _id: -1 }).lean(),
      user.role === 'admin' ? User.find({ role: { $in: ['admin', 'seller'] } }).select('username storeName').lean() : [user],
      user.role === 'admin' ? User.countDocuments({}) : Promise.resolve(null)
    ]);
    res.set('Cache-Control', 'no-store').json({
      user: { id: String(user._id), username: user.username, role: user.role, storeName: user.storeName, storeLocation: user.storeLocation },
      stores: owners.map((owner) => ({ id: String(owner._id), name: owner.storeName || `${owner.username}'s catalog` })),
      products,
      stats: {
        totalUsers,
        totalProducts: products.length,
        totalStock: products.reduce((sum, p) => sum + p.stock, 0),
        lowStock: products.filter((p) => p.stock <= 5).length,
        inventoryValue: products.reduce((sum, p) => sum + p.price * p.stock, 0)
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
