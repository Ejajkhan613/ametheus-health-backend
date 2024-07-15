// models/currencyPriceModel.js
const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema({
    currency: {
        type: String,
        required: true,
        unique: true
    },
    rate: {
        type: Number,
        required: true
    },
    symbol: {
        type: String
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

const ExchangeRate = mongoose.model('ExchangeRate', exchangeRateSchema);

module.exports = ExchangeRate;






// // models/categoryModel.js
// const mongoose = require('mongoose');
// const Schema = mongoose.Schema;

// const categorySchema = new Schema({
//     USD: {
//         type: Number,
//         default: 0.01197
//     },
//     EUR: {
//         type: Number,
//         default: 0.01106
//     },
//     GBP: {
//         type: Number,
//         default: 0.009342
//     },
//     RUB: {
//         type: Number,
//         default: 1.0573
//     },
//     AED: {
//         type: Number,
//         default: 0.04397
//     },
//     createdAt: { type: Date, default: Date.now },
//     lastModified: { type: Date, default: Date.now }
// });

// const CategoryModel = mongoose.model('Currency', categorySchema);

// module.exports = CategoryModel;