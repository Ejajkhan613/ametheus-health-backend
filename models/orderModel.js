// models/orderModel.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  companyName: {
    type: String,
    default: null,
  },
  country: {
    type: String,
    required: true,
  },
  streetAddress: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  pincode: {
    type: String,
    required: true,
  },
  mobile: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  age: {
    type: Number,
    required: true,
  },
  bloodPressure: {
    type: String,
    default: null,
  },
  weight: {
    type: Number,
    default: null,
  },
  weightUnit: {
    type: String,
    enum: ['KG', 'IB'],
    default: KG,
  },
  prescriptionURL: {
    type: String,
    default: null,
  },
  passportURL: {
    type: String,
    required: true,
  },
  orderNotes: {
    type: String,
    default: null,
  },
  products: [{
    productID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    variantID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      default: null,
    },
  }],
  currency: {
    type: String,
    required: true,
  },
  totalCartPrice: {
    type: Number,
    required: true,
  },
  deliveryCharge: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Processing Order', 'Shipped', 'Delivered'],
    default: 'Pending',
  },
  trackingLink: {
    type: String,
    default: null,
  },
  payment: {
    orderId: {
      type: String,
      default: null,
    },
    paymentId: {
      type: String,
      default: null,
    },
    signature: {
      type: String,
      default: null,
    },
  },
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
