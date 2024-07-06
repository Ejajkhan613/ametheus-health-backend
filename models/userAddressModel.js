const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    houseNumber: { type: String, required: true },
    locality: { type: String, required: true },
    city: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    state: { type: String, required: true },
    zipcode: { type: String, required: true },
    landmark: { type: String, required: false },
    createdDate: { type: Date, default: Date.now },
    addressType: { type: String, enum: ['HOME', 'OFFICE', 'OTHER'], required: true },
    otherAddressType: { type: String, required: function () { return this.address_type === 'OTHER'; } },
    name: { type: String, required: true }
});

module.exports = mongoose.model('Address', addressSchema);