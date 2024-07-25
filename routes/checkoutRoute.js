require('dotenv').config();
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const { calculateTotalCartPrice } = require('../utils/cartUtils');
const Order = require('../models/orderModel');
const User = require('../models/userModel');
const verifyToken = require('../middlewares/auth');

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Configure AWS S3 for file uploads
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Handle file uploads to S3
const uploadFile = async (file) => {
    if (!file) {
        throw new Error('No file provided');
    }

    // Validate file type and size
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10 MB

    if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new Error('Invalid file type');
    }

    if (file.size > maxSize) {
        throw new Error('File size exceeds limit');
    }

    const fileContent = Buffer.from(file.buffer, 'binary');
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `orderuploads/${Date.now()}_${file.originalname}`,
        Body: fileContent,
        ContentType: file.mimetype,
        ACL: 'public-read',
    };

    try {
        const command = new PutObjectCommand(params);
        await s3.send(command);
        return `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;
    } catch (error) {
        console.error('Error uploading file to S3:', error);
        throw new Error('File upload failed');
    }
};

// Verify payment signature
const verifyPayment = (orderId, paymentId, signature) => {
    const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    return generatedSignature === signature;
};

// Create Razorpay order
const createOrder = async (totalCartPrice, currency) => {
    return await razorpay.orders.create({
        amount: totalCartPrice * 100, // amount in paise
        currency,
        receipt: uuidv4(),
        payment_capture: '1',
    });
};

// Checkout route with file uploads and complete order details
router.post('/create-order',
    verifyToken,
    upload.fields([{ name: 'prescriptionImage', maxCount: 1 }, { name: 'passportImage', maxCount: 1 }]),
    [
        body('name').isString().notEmpty(),
        body('companyName').isString().optional(),
        body('country').isString().notEmpty(),
        body('streetAddress').isString().notEmpty(),
        body('city').isString().notEmpty(),
        body('state').isString().notEmpty(),
        body('pincode').isString().notEmpty(),
        body('mobile').isString().notEmpty(),
        body('email').isEmail().notEmpty(),
        body('age').isInt({ min: 0 }).notEmpty(),
        body('bloodPressure').isString().optional(),
        body('weight').isFloat().optional(),
        body('weightUnit').isIn(['KG', 'IB']).optional(),
        body('orderNotes').isString().optional(),
        body('products').isArray().withMessage('Products should be an array').notEmpty(),
        body('currency').isIn(['INR', 'USD', 'EUR', 'GBP', 'AED', 'RUB']).notEmpty(),
        body('totalCartPrice').isFloat().notEmpty(),
        body('deliveryCharge').isFloat().notEmpty(),
        body('totalPrice').isFloat().notEmpty(),
        body('status').isIn(['Pending', 'Completed', 'Failed']).notEmpty(),
        body('paymentGateway').isObject().withMessage('PaymentGateway should be an object').notEmpty(),
        body('userID').isString().notEmpty(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const {
                name, companyName, country, streetAddress, city, state, pincode, mobile, email, age, bloodPressure, weight, weightUnit,
                orderNotes, products, currency, totalCartPrice, deliveryCharge, totalPrice, status, paymentGateway, userID
            } = req.body;

            // Check if prescription is required
            const cartDetails = await calculateTotalCartPrice(userID, country, currency);
            if (!cartDetails) {
                return res.status(400).send('Unable to calculate cart details');
            }
            const { requiresPrescription } = cartDetails;

            let prescriptionURL = '';
            let passportURL = '';

            if (requiresPrescription && !req.files['prescriptionImage']) {
                return res.status(400).send('Prescription image is required for some products in your cart.');
            }

            if (req.files['prescriptionImage']) {
                prescriptionURL = await uploadFile(req.files['prescriptionImage'][0]);
            }

            if (req.files['passportImage']) {
                passportURL = await uploadFile(req.files['passportImage'][0]);
            }

            // Create Razorpay order
            const order = await createOrder(totalPrice, currency);

            // Save the order details in the database
            const newOrder = new Order({
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
                status,
                paymentGateway: {
                    ...paymentGateway,
                    orderId: order.id
                },
                userID,
                prescriptionURL,
                passportURL,
                timeStamp: new Date(),
            });

            await newOrder.save();

            // Respond with order details
            res.json({
                orderId: order.id,
                currency,
                amount: totalPrice,
                key_id: process.env.RAZORPAY_KEY_ID
            });
        } catch (error) {
            console.error('Error creating order:', error);
            res.status(500).send('Internal Server Error');
        }
    }
);

// Handle payment callback
router.post('/payment-callback',
    [
        body('order_id').isString().notEmpty(),
        body('payment_id').isString().notEmpty(),
        body('signature').isString().notEmpty(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { order_id, payment_id, signature } = req.body;

            // Verify payment signature
            if (!verifyPayment(order_id, payment_id, signature)) {
                return res.status(400).send('Payment verification failed');
            }

            // Update order status
            const order = await Order.findOne({ 'paymentGateway.orderId': order_id });
            if (order) {
                order.paymentGateway.paymentId = payment_id;
                order.paymentGateway.signature = signature;
                order.status = 'Completed';
                await order.save();
            }

            // Respond to Razorpay callback
            res.status(200).send('Payment verified successfully');
        } catch (error) {
            console.error('Error handling payment callback:', error);
            res.status(500).send('Internal Server Error');
        }
    }
);

// Update order status and tracking information
router.patch('/update-order/:orderId',
    verifyToken,
    [
        body('status').isString().notEmpty(),
        body('trackingLink').isString().optional().isURL(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { orderId } = req.params;
            const { status, trackingLink } = req.body;

            const updatedOrder = await Order.findByIdAndUpdate(orderId, { status, trackingLink }, { new: true });
            if (!updatedOrder) {
                return res.status(404).send('Order not found');
            }

            res.json(updatedOrder);
        } catch (error) {
            console.error('Error updating order:', error);
            res.status(500).send('Internal Server Error');
        }
    }
);

// Route to get latest orders with user details
router.get('/admin/orders', verifyToken, async (req, res) => {
    try {
        const { filter = 'all', page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Build query based on filter
        let query = {};
        if (filter === 'successful') {
            query.status = 'Completed';
        } else if (filter === 'failed') {
            query.status = 'Failed';
        }

        // Fetch orders with pagination and user details
        const orders = await Order.find(query)
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ timeStamp: -1 })
            .populate('userID', 'name email'); // Populate user details

        // Count total orders for pagination
        const totalOrders = await Order.countDocuments(query);

        res.json({
            orders,
            totalPages: Math.ceil(totalOrders / limit),
            currentPage: page,
            totalOrders
        });
    } catch (error) {
        console.error('Error fetching admin orders:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route to get all orders for a specific user
router.get('/admin/user-orders/:userID', verifyToken, async (req, res) => {
    try {
        const { userID } = req.params;

        // Fetch user details
        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Fetch orders for the user
        const orders = await Order.find({ userID }).sort({ timeStamp: -1 });

        res.json({
            user,
            orders
        });
    } catch (error) {
        console.error('Error fetching orders for user:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route to get past purchases for a user
router.get('/user/orders', verifyToken, async (req, res) => {
    try {
        const { filter = 'all', sort = 'latest' } = req.query;
        const userID = req.user.id; // Assumes user ID is attached to req.user by verifyToken

        // Build query based on filter
        let query = { userID };
        if (filter === 'successful') {
            query.status = 'Completed';
        } else if (filter === 'failed') {
            query.status = 'Failed';
        }

        // Build sort option based on sort parameter
        let sortOption;
        switch (sort) {
            case 'latest':
                sortOption = { timeStamp: -1 };
                break;
            case 'oldest':
                sortOption = { timeStamp: 1 };
                break;
            case 'highest_payment':
                sortOption = { totalPrice: -1 };
                break;
            case 'lowest_payment':
                sortOption = { totalPrice: 1 };
                break;
            default:
                sortOption = { timeStamp: -1 };
                break;
        }

        // Fetch orders
        const orders = await Order.find(query).sort(sortOption);
        res.json(orders);
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;