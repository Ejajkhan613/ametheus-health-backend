// config/db.js
const mongoose = require('mongoose');

const DBConnection = mongoose.connect(process.env.DB);

module.exports = DBConnection;