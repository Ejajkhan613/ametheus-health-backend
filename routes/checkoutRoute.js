require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const router = express.Router();
const Razorpay = require('razorpay');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

const { calculateTotalCartPrice } = require('../utils/cartUtils');
const Order = require('../models/orderModel');
const verifyToken = require('../middlewares/auth');
const UserModel = require('../models/userModel');

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RZPY_KEY_ID_AH,
    key_secret: process.env.RZPY_KEY_SECRET_AH,
});

const AWS = require('aws-sdk');
router.use(fileUpload());

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const uploadToS3 = (buffer, key, mimeType) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read'
    };

    return s3.upload(params).promise();
};

const deleteFromS3 = async (key) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
    };

    return s3.deleteObject(params).promise();
};

const generateKey = (originalname, orderID = "") => {
    const ext = path.extname(originalname);

    const now = new Date();

    // Format the date
    const day = String(now.getDate()).padStart(2, '0');
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[now.getMonth()];
    const year = now.getFullYear();

    // Format the time
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    const formattedHours = String(hours).padStart(2, '0');

    const formattedDate = `${day}-${month}-${year}-${formattedHours}-${minutes}-${period}`;

    return `orders/orderid-${orderID}-hash-${crypto.randomBytes(16).toString('hex')}-date-${formattedDate}${ext}`;
};

// Verify payment signature
const verifyPayment = (orderId, paymentId, signature) => {
    const generatedSignature = crypto.createHmac('sha256', process.env.RZPY_KEY_SECRET_AH)
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

// Create Order Route
router.post('/create-order', verifyToken, async (req, res) => {
    try {
        const {
            name, companyName = "", country, streetAddress, city, state, pincode, mobile, email, age, bloodPressure, weight, weightUnit,
            orderNotes, currency
        } = req.body;

        if (!name) {
            return res.status(404).send({ "msg": "name is missing" })
        }

        if (!country) {
            return res.status(404).send({ "msg": "country is missing" })
        }

        if (!streetAddress) {
            return res.status(404).send({ "msg": "streetAddress is missing" })
        }

        if (!city) {
            return res.status(404).send({ "msg": "city is missing" })
        }

        if (!state) {
            return res.status(404).send({ "msg": "state is missing" })
        }

        if (!pincode) {
            return res.status(404).send({ "msg": "pincode is missing" })
        }

        if (!mobile) {
            return res.status(404).send({ "msg": "mobile is missing" })
        }

        if (!email) {
            return res.status(404).send({ "msg": "email is missing" })
        }

        if (age && age <= 0) {
            return res.status(404).send({ "msg": "age is wrong" })
        }

        if (bloodPressure && (bloodPressure <= 0 || bloodPressure >= 500)) {
            return res.status(404).send({ "msg": "age is wrong" })
        }

        let validCurrencies = ["INR", "USD", "EUR", "GBP", "AED", "RUB"]
        if (!currency) {
            return res.status(404).send({ "msg": "currency is missing" })
        }

        if (!validCurrencies.includes(currency)) {
            return res.status(404).send({ "msg": "currency is missing" })
        }

        const userID = req.userDetail._id;

        // Fetch cart details for the user
        const cartDetails = await calculateTotalCartPrice(userID, country, currency);
        if (!cartDetails) {
            return res.status(400).send('Unable to calculate cart details');
        }

        let { products, totalCartPrice, deliveryCharge, totalPrice } = cartDetails;

        let prescriptionImage = '';
        let passportImage = '';

        const paisaAmount = Math.round((+totalCartPrice) * 100);

        // Create Razorpay order
        const order = await createOrder((+paisaAmount), currency);

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
            status: "Pending",
            payment: {
                orderId: order.id
            },
            userID,
            prescriptionImage,
            passportImage
        });

        await newOrder.save();

        // Respond with order details
        res.json({
            _id: newOrder._id,
            orderId: order.id,
            currency,
            amount: totalCartPrice,
            key_id: process.env.RZPY_KEY_ID_AH
        });
    } catch (error) {
        console.log(error);
        console.error('Error creating order:', error);
        res.status(500).send('Internal Server Error');
    }
}
);

// Route to add a prescription image to an order
router.post('/:id/prescription-image', verifyToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).send({ msg: 'Order not found' });
        }

        if (order.userID.toString() !== req.userDetail._id.toString()) {
            return res.status(404).send({ msg: 'Order not found...' });
        }

        const file = req.files && req.files.prescriptionImage;
        if (!file) {
            return res.status(400).send({ msg: 'No prescription image provided.' });
        }

        // Generate S3 key and upload to S3
        const s3Key = generateKey(file.name, req.params.id);
        const uploadResult = await uploadToS3(file.data, s3Key, file.mimetype);

        // Update order with the new prescription image URL
        order.prescriptionImage = uploadResult.Location;
        await order.save();

        res.status(200).send({ msg: 'Prescription image added successfully', data: order });
    } catch (error) {
        console.error('Error adding prescription image:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to add a passport image to an order
router.post('/:id/passport-image', verifyToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).send({ msg: 'Order not found' });
        }
        if (order.userID.toString() !== req.userDetail._id.toString()) {
            return res.status(404).send({ msg: 'Order not found...' });
        }

        const file = req.files && req.files.passportImage;
        if (!file) {
            return res.status(400).send({ msg: 'No passport image provided.' });
        }

        // Generate S3 key and upload to S3
        const s3Key = generateKey(file.name, req.params.id);
        const uploadResult = await uploadToS3(file.data, s3Key, file.mimetype);

        // Update order with the new passport image URL
        order.passportImage = uploadResult.Location;
        await order.save();

        res.status(200).send({ msg: 'Passport image added successfully', data: order });
    } catch (error) {
        console.error('Error adding passport image:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

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
            const order = await Order.findOne({ 'payment.orderId': order_id });
            if (order) {
                order.payment.paymentId = payment_id;
                order.payment.signature = signature;
                order.status = 'Accepted';
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
        body('trackingLink').isString().optional(),
        body('deliveryPartner').isString().optional(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        if (req.userDetail.role !== "admin") {
            return res.status(400).send({ msg: 'Access Denied' });
        }

        try {
            const { orderId } = req.params;
            const { status, trackingLink, deliveryPartner } = req.body;

            const updatedOrder = await Order.findByIdAndUpdate(orderId, { status, trackingLink, deliveryPartner }, { new: true });
            if (!updatedOrder) {
                return res.status(404).send('Order not found');
            }

            res.status(200).json({ 'msg': updatedOrder });
        } catch (error) {
            console.error('Error updating order:', error);
            res.status(500).send('Internal Server Error');
        }
    }
);

// Get all Orders with search, filter and pagination
router.get('/admin/orders', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    try {
        let {
            status, page = 1, limit = 10,
            search
        } = req.query;

        let skip = (page - 1) * limit;

        let filter = {};

        if (search) {
            if (mongoose.Types.ObjectId.isValid(search)) {
                filter.$or = [
                    { _id: search },
                    { userID: search }
                ];
            } else {
                filter.$or = [
                    { name: new RegExp(search, 'i') },
                    { country: new RegExp(search, 'i') },
                    { pincode: new RegExp(search, 'i') },
                    { mobile: new RegExp(search, 'i') },
                    { email: new RegExp(search, 'i') },
                    { currency: new RegExp(search, 'i') }
                ];
            }
        }

        if (status) filter.status = status;

        const orders = await Order.find(filter)
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ updatedAt: -1 });

        const totalOrders = await Order.countDocuments(filter);

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

// Get an Order by ID
router.get('/admin/orders/:id', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;

        // Check if the ID is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).send({ msg: 'Invalid Order ID' });
        }

        // Find the order by ID
        const order = await Order.findById(id).lean();

        if (!order) {
            return res.status(404).send({ msg: 'Order not found' });
        }

        let user = await UserModel.findById(order.userID).select('-password -__v');
        order.user = user;

        res.json(order);
    } catch (error) {
        console.error('Error fetching order by ID:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route to get past purchases for a user
router.get('/user/orders', verifyToken, async (req, res) => {
    try {
        const { filter = 'all', sort = 'latest' } = req.query;
        const userID = req.userDetail.id; // Assumes user ID is attached to req.user by verifyToken

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
                sortOption = { createdAt: -1 };
                break;
            case 'oldest':
                sortOption = { createdAt: 1 };
                break;
            case 'highest_payment':
                sortOption = { totalCartPrice: -1 };
                break;
            case 'lowest_payment':
                sortOption = { totalCartPrice: 1 };
                break;
            default:
                sortOption = { createdAt: -1 };
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