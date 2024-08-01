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
    default: 0,
  },
  weight: {
    type: Number,
    default: 0,
  },
  weightUnit: {
    type: String,
    enum: ['KG', 'LB'],
    default: "KG",
  },
  orderNotes: {
    type: String,
    default: null,
  },
  products: [{
    productID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    images: {
      type: [],
      default: []
    },
    quantity: {
      type: Number,
      required: true
    },
    variantID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: true
    },
    title: {
      type: String,
      default: ""
    },
    packSize: {
      type: String,
      default: ""
    },
    price: {
      type: String,
      default: ""
    },
    salePrice: {
      type: String,
      default: ""
    },
    margin: {
      type: Number,
      default: 0
    },
    currency: {
      type: String
    },
  }],
  currency: {
    type: String,
    required: true
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
  },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Processing Order', 'Shipped', 'Delivered'],
    default: 'Pending'
  },
  trackingLink: {
    type: String,
    default: null
  },
  deliveryPartner: {
    type: String,
    default: null
  },
  payment: {
    orderId: {
      type: String,
      default: null
    },
    paymentId: {
      type: String,
      default: null
    },
    signature: {
      type: String,
      default: null
    },
  },
}, { timestamps: true, });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
