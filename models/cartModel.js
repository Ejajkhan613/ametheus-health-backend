const mongoose = require('mongoose');

const variantDetailSchema = new mongoose.Schema({
    _id: mongoose.Schema.Types.ObjectId,
    sku: String,
    price: Number,
    salePrice: Number,
    minOrderQuantity: Number,
    maxOrderQuantity: Number,
    margin: Number,
    packSize: String,
    isStockAvailable: Boolean,
    weight: Number,
    weightUnit: String,
    length: Number,
    lengthUnit: String,
    width: Number,
    widthUnit: String,
    height: Number,
    heightUnit: String,
    currency: String
});

const cartDetailSchema = new mongoose.Schema({
    productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantID: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true },
    productDetail: { type: {} },
    variantDetail: variantDetailSchema
});

const cartSchema = new mongoose.Schema({
    userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cartDetails: [cartDetailSchema]
});

const CartItem = mongoose.model('Cart', cartSchema);

module.exports = CartItem;
