// routes/checkoutRoute.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { calculateTotalCartPrice } = require('../utils/cartUtils');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const Order = require('../models/orderModel');
const verifyToken = require('../middlewares/auth');

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: 'YOUR_RAZORPAY_KEY_ID',
    key_secret: 'YOUR_RAZORPAY_KEY_SECRET',
});

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() }); // Use memory storage to handle file buffer

// Configure AWS S3 for file uploads
const s3 = new S3Client({
    region: 'YOUR_AWS_REGION',
    credentials: {
        accessKeyId: 'YOUR_AWS_ACCESS_KEY_ID',
        secretAccessKey: 'YOUR_AWS_SECRET_ACCESS_KEY',
    },
});

// handle file uploads to S3
const uploadFile = async (file) => {
    const fileContent = Buffer.from(file.buffer, 'binary');
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `uploads/${Date.now()}_${file.originalname}`,
        Body: fileContent,
        ContentType: file.mimetype,
        ACL: 'public-read',
    };

    try {
        const command = new PutObjectCommand(params);
        const data = await s3.send(command);
        return `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`; // Return the file URL
    } catch (error) {
        console.error('Error uploading file to S3:', error);
        throw new Error('File upload failed');
    }
};

// verify payment signature
const verifyPayment = (orderId, paymentId, signature) => {
    const generatedSignature = crypto.createHmac('sha256', 'YOUR_RAZORPAY_KEY_SECRET')
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    return generatedSignature === signature;
};

// Create Razorpay order
const createOrder = async (totalCartPrice, currency) => {
    return await razorpay.orders.create({
        amount: totalCartPrice * 100, // amount in paise
        currency: currency,
        receipt: uuidv4(),
        payment_capture: '1',
    });
};

// create Razorpay order
router.post('/create-order', verifyToken, async (req, res) => {
    try {
        const { country = 'INDIA', currency = 'INR' } = req.body;
        const userID = req.userDetail._id;

        // Calculate total cart price based on the provided userID and country
        const cartDetails = await calculateTotalCartPrice(userID, country, currency);

        if (!cartDetails) {
            return res.status(400).send('Unable to calculate cart details');
        }

        const { totalCartPrice, deliveryCharge, totalPrice } = cartDetails;

        // Create Razorpay order
        const order = await createOrder(totalPrice, currency);

        // Save the order details in the database
        const newOrder = new Order({
            userID,
            name: req.body.name,
            companyName: req.body.companyName,
            country,
            streetAddress: req.body.streetAddress,
            city: req.body.city,
            state: req.body.state,
            pincode: req.body.pincode,
            mobile: req.body.mobile,
            email: req.body.email,
            age: req.body.age,
            passportURL: req.body.passportURL, // Assume passportURL is provided
            bloodPressure: req.body.bloodPressure,
            weight: req.body.weight,
            weightUnit: req.body.weightUnit,
            prescriptionURL: req.body.prescriptionURL,
            orderNotes: req.body.orderNotes,
            products: req.body.products, // Assuming products are provided in the request
            currency,
            totalCartPrice,
            deliveryCharge,
            totalPrice,
            status: 'Pending',
            payment: {
                orderId: order.id
            }
        });

        await newOrder.save();

        // Respond with order details
        res.json({
            orderId: order.id,
            currency: order.currency,
            amount: totalPrice, // Amount in the desired currency
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint to handle file uploads and checkout
router.post('/checkout', upload.fields([{ name: 'passportImage', maxCount: 1 }, { name: 'prescriptionImage', maxCount: 1 }]), async (req, res) => {
    try {
        const {
            userID,
            name,
            companyName,
            country,
            streetAddress,
            city,
            state,
            pincode,
            mobile,
            email,
            age,
            bloodPressure,
            weight,
            weightUnit,
            orderNotes,
            products,
            currency,
            totalCartPrice,
            deliveryCharge,
            totalPrice,
        } = req.body;

        const passportImageUrl = req.files.passportImage ? await uploadFile(req.files.passportImage[0]) : null;
        const prescriptionImageUrl = req.files.prescriptionImage ? await uploadFile(req.files.prescriptionImage[0]) : null;

        // Save order details to the database
        const newOrder = new Order({
            userID,
            name,
            companyName,
            country,
            streetAddress,
            city,
            state,
            pincode,
            mobile,
            email,
            age,
            bloodPressure,
            weight,
            weightUnit,
            orderNotes,
            products,
            currency,
            totalCartPrice,
            deliveryCharge,
            totalPrice,
            passportImageUrl,
            prescriptionImageUrl,
            status: 'Pending', // Status of the order
        });

        await newOrder.save();

        res.send('Checkout completed successfully');
    } catch (error) {
        console.error('Error during checkout:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint to verify payment
router.post('/verify-payment', async (req, res) => {
    try {
        const { orderId, paymentId, signature } = req.body;

        if (verifyPayment(orderId, paymentId, signature)) {
            // Payment verified
            await Order.updateOne({ 'payment.orderId': orderId }, { $set: { 'payment.paymentId': paymentId, 'payment.signature': signature, status: 'Completed' } });
            res.send('Payment Successful');
        } else {
            res.status(400).send('Invalid Signature');
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Endpoint to get payment history
router.get('/payment-history', verifyToken, async (req, res) => {
    try {
        const userID = req.userDetail._id;
        const { status } = req.query;

        // Build query object based on the status parameter
        let query = { userID };

        if (status === 'success') {
            query['status'] = 'Completed';
        } else if (status === 'unsuccess') {
            query['status'] = { $ne: 'Completed' };
        }

        // Fetch payment history from the database
        const orders = await Order.find(query)
            .sort({ createdAt: -1 }) // Sort by creation date, latest first
            .select('orderID totalCartPrice deliveryCharge totalPrice currency status createdAt'); // Select fields to return

        // Respond with the payment history
        res.json(orders);
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;