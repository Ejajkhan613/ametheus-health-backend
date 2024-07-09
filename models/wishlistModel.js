// models/wishlistModel.js
const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
    userID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        productID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        },
        variantID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product.variants'
        }
    }]
}, { timestamps: true });

const WishlistItem = mongoose.model('Wishlist', wishlistSchema);

module.exports = WishlistItem;
