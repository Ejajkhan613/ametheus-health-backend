// models/productModel.js
const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
    sku: {
        type: String,
        required: true
    },
    packSize: {
        type: String
    },
    isStockAvailable: {
        type: Boolean,
        default: true
    },
    currency: {
        type: String,
        default: "₹"
    },
    price: {
        type: Number,
        default: 0
    },
    salePrice: {
        type: Number
    },
    margin: {
        type: Number,
        default: 0
    },
    minOrderQuantity: {
        type: Number,
        default: 0
    },
    maxOrderQuantity: {
        type: Number,
        default: 100
    },
    weight: {
        type: Number,
        default: null
    },
    weightUnit: {
        type: String,
        default: ""
    },
    length: {
        type: Number,
        default: null
    },
    lengthUnit: {
        type: String,
        default: ""
    },
    width: {
        type: Number,
        default: null
    },
    widthUnit: {
        type: String,
        default: ""
    },
    height: {
        type: Number,
        default: null
    },
    heightUnit: {
        type: String,
        default: ""
    }
});


const imageSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true
    },
    alt: {
        type: String,
        default: ""
    }
});

const productSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true
    },
    images: {
        type: [imageSchema],
        default: []
    },
    genericID: {
        type: String,
        default: ""
    },
    generic: {
        type: String,
        default: ""
    },
    treatment: {
        type: String,
        default: ""
    },
    isReturnable: {
        type: Boolean,
        default: false
    },
    isPrescriptionRequired: {
        type: Boolean,
        default: false
    },
    isVisible: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    shortDescription: {
        type: String,
        default: ""
    },
    description: {
        type: String,
        default: ""
    },
    sideEffects: {
        type: String,
        default: ""
    },
    faq: {
        type: String,
        default: ""
    },
    additionalInformation: {
        type: String,
        default: ""
    },
    moreInformation: {
        type: String,
        default: ""
    },
    purchaseNote: {
        type: String,
        default: ""
    },
    categoryID: {
        type: String,
        default: ""
    },
    tags: {
        type: String,
        default: ""
    },
    upSell: {
        type: [String],
        default: []
    },
    crossSell: {
        type: [String],
        default: []
    },
    externalLink: {
        type: String,
        default: ""
    },
    position: {
        type: Number,
        default: null
    },
    manufacturerID: {
        type: String,
        default: ""
    },
    originCountry: {
        type: String,
        default: "India"
    },
    isDiscontinued: {
        type: Boolean,
        default: false
    },
    metaTitle: {
        type: String,
        default: "Ametheus Health"
    },
    metaDescription: {
        type: String,
        default: "Ametheus Health offers a wide range of treatments through our dedicated online service. The service is safe, discreet and convenient and all medicines are dispensed from the licensed pharmacies through our online portal by insured courier."
    },
    metaTags: {
        type: String,
        default: "Ametheus Health, Discreet Medicine Delivery, Medical Help, Doctor Consultation, Global Medicine Delivery, Medicines, Purchase, Health Record, My Health Record, Pharmacy, Online Pharmacy"
    },
    variants: [variantSchema]
});

const ProductModel = mongoose.model('Product', productSchema);

module.exports = ProductModel;
