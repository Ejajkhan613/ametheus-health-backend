// models/otpModel.js
const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    otp: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ["REGISTER", "FORGETPASSWORD"]
    },
    expiresAt: {
        type: Date,
        required: true,
        default: Date.now,
        index: { expires: '15m' }
    },
}, { strict: false });

const OTPModel = mongoose.model('OTP', otpSchema);

module.exports = OTPModel;
