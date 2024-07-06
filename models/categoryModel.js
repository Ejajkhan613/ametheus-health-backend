// models/categoryModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const categorySchema = new Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    docFileURL: { type: String, default: "" },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    children: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
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
    createdAt: { type: Date, default: Date.now },
    lastModified: { type: Date, default: Date.now }
});

const CategoryModel = mongoose.model('Category', categorySchema);

module.exports = CategoryModel;
