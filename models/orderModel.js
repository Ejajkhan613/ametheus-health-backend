// models/OrderModel.js
const mongoose = require('mongoose');

const productDetailSchema = new mongoose.Schema({
    productID: {
        type: String,
        required: true
    },
    variantID: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    variantName: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    salePrice: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true
    },
    margin: {
        type: Number
    }
});

const orderSchema = new mongoose.Schema({
    userID: {
        type: String,
        default: "NILL"
    },
    name: {
        type: String,
        required: true
    },
    companyName: {
        type: String
    },
    country: {
        type: String,
        required: true
    },
    streetAddress: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    pincode: {
        type: Number,
        required: true
    },
    mobile: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    age: {
        type: Number,
        min: 1,
        max: 130,
        required: true
    },
    passportURL: {
        type: String,
        required: true
    },
    bloodPressure: {
        type: Number
    },
    weight: {
        type: String
    },
    weightUnit: {
        type: String,
        enum: ["KG", "IB"]
    },
    prescriptionURL: {
        type: String
    },
    orderNotes: {
        type: String
    },
    products: {
        type: [productDetailSchema],
        required: true
    },
    currency: {
        type: String,
        enum: ["INR", "USD", "EUR", "GBP", "RUB"]
    },
    totalCartPrice: {
        type: Number,
        required: true
    },
    deliveryCharge: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    }
}, { timestamps: true });

const OrderItem = mongoose.model('Order', orderSchema);

module.exports = OrderItem;