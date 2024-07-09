// models/counterModel.js
const mongoose = require('mongoose');

const genericSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true
    },
    uses: {
        type: String
    },
    works: {
        type: String
    },
    sideEffects: {
        type: String
    },
    expertAdvice: {
        type: String
    },
    faq: {
        type: String
    }
});

const GenericModel = mongoose.model('Generic', genericSchema);

module.exports = GenericModel;