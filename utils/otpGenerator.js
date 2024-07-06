// utils/otpGenerator.js
const crypto = require('crypto');


// Function to generate OTP using Crypto;
function generateOTP() {
    const length = 6;
    const digits = '0123456789';
    const buffer = crypto.randomBytes(length);
    let otp = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = buffer[i] % digits.length;
        otp += digits[randomIndex];
    }

    return otp;
}


// Exporting Modules
module.exports = generateOTP;
