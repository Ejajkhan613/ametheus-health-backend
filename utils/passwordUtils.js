const crypto = require('crypto');

function generateSecurePassword(length = 12) {
    if (length < 12) {
        throw new Error('Password length should be at least 12 characters');
    }

    // Generate random bytes
    const buffer = crypto.randomBytes(length);
    // Convert bytes to a hexadecimal string
    const password = buffer.toString('hex').slice(0, length);

    return password;
}

module.exports = generateSecurePassword;

