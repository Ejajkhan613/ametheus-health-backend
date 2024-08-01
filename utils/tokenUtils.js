const jwt = require('jsonwebtoken');

const generateToken = (user) => {
    return jwt.sign({ "userID": user._id }, process.env.SECRET_KEY, { expiresIn: '15d' });
};

module.exports = generateToken;