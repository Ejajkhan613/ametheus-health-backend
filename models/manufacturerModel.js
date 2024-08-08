// models/counterModel.js
const mongoose = require('mongoose');

const manufacturerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true
    },
    address: {
        type: String
    }
}, { timestamps: true });

const ManufacturerModel = mongoose.model('Manufacturer', manufacturerSchema);

module.exports = ManufacturerModel;