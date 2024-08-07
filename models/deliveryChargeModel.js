const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const deliveryChargeSchema = new Schema({
    country: {
        type: String,
        required: true,
        unique: true
    },
    deliveryCharge: [
        {
            minAmount: { type: Number, required: true },
            maxAmount: { type: Number, required: true },
            charge: { type: Number, required: true }
        }
    ]
});

const DeliveryCharge = mongoose.model('DeliveryCharge', deliveryChargeSchema);

module.exports = DeliveryCharge;