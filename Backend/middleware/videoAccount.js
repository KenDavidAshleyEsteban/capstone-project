const User = require('../models/User');
module.exports = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('username role');
    if (!user) return res.status(401).json({ message: 'Sign in again to manage build videos.' });
    req.videoAccount = user;
    next();
  } catch (error) { next(error); }
};
