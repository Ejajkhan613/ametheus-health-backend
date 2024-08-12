// middlewares/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

const verifyToken = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.id || !req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token or id provided' });
  }

  const token = req.headers.authorization.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    if (decoded.userID !== req.headers.id) {
      return res.status(400).send({ message: "Not authorized, id and token do not match" });
    }

    req.userDetail = await User.findById(decoded.userID).lean();
    if (!req.userDetail) {
      return res.status(404).json({ message: 'Account not matched' });
    }

    next();
  } catch (err) {
    console.log(err);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Not authorized, token expired' });
    } else {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
};

module.exports = verifyToken;