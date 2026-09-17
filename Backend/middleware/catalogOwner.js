const User = require('../models/User');

// Resolve the current role from the database, rather than trusting an old JWT role.
module.exports = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('username role storeName storeLocation');
    if (!user) return res.status(401).json({ message: 'Your account is no longer available. Sign in again.' });
    if (!['admin', 'seller'].includes(user.role)) return res.status(403).json({ message: 'A store owner or admin account is required.' });
    req.catalogOwner = user;
    next();
  } catch (error) {
    next(error);
  }
};
