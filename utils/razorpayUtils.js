const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: 'YOUR_RAZORPAY_KEY_ID',
    key_secret: 'YOUR_RAZORPAY_KEY_SECRET',
});

const createOrder = async (amount, currency) => {
    try {
        const order = await razorpay.orders.create({
            amount: amount * 100, // amount in paise
            currency: currency,
            receipt: uuidv4(),
            payment_capture: '1',
        });
        return order;
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        throw error;
    }
};

const verifyPayment = (orderId, paymentId, signature) => {
    const generatedSignature = crypto.createHmac('sha256', 'YOUR_RAZORPAY_KEY_SECRET')
        .update(orderId + "|" + paymentId)
        .digest('hex');
    return generatedSignature === signature;
};

module.exports = { createOrder, verifyPayment };
