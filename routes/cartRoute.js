const express = require('express');
const mongoose = require('mongoose');
const verifyToken = require('../middlewares/auth');
const CartItem = require('../models/cartModel');
const Product = require('../models/productModel');
const WishlistItem = require('../models/wishlistModel');

const cartRoute = express.Router();

// Add item to cart from product list
cartRoute.post('/', verifyToken, async (req, res) => {
    try {
        const { productID, variantID, quantity = 1 } = req.body;
        const userID = req.userDetail._id;

        const product = await Product.findById(productID);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        const variant = product.variants.id(variantID);
        if (!variant) {
            return res.status(404).send({ msg: 'Variant not found' });
        }

        if (quantity < variant.minOrderQuantity || quantity > variant.maxOrderQuantity) {
            return res.status(400).send({ msg: `Quantity must be between ${variant.minOrderQuantity} and ${variant.maxOrderQuantity}` });
        }

        let cartItem = await CartItem.findOne({ userID, productID, variantID });
        if (cartItem) {
            cartItem.quantity += quantity;
            if (cartItem.quantity > variant.maxOrderQuantity) {
                cartItem.quantity = variant.maxOrderQuantity;
            }
        } else {
            cartItem = new CartItem({
                userID,
                productID,
                variantID,
                quantity
            });
        }

        await cartItem.save();
        res.status(200).send({ msg: 'Product added to cart successfully', data: cartItem });
    } catch (error) {
        console.error('Error adding product to cart:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Add item to cart from wishlist
cartRoute.post('/add-from-wishlist', verifyToken, async (req, res) => {
    try {
        const { wishlistItemID, quantity } = req.body;
        const userID = req.userDetail._id;

        const wishlistItem = await WishlistItem.findById(wishlistItemID).populate('productID');
        if (!wishlistItem) {
            return res.status(404).send({ msg: 'Wishlist item not found' });
        }

        const product = wishlistItem.productID;
        const variantID = wishlistItem.variantID;
        const variant = product.variants.id(variantID);

        if (quantity < variant.minOrderQuantity || quantity > variant.maxOrderQuantity) {
            return res.status(400).send({ msg: `Quantity must be between ${variant.minOrderQuantity} and ${variant.maxOrderQuantity}` });
        }

        let cartItem = await CartItem.findOne({ userID, productID: product._id, variantID });
        if (cartItem) {
            cartItem.quantity += quantity;
            if (cartItem.quantity > variant.maxOrderQuantity) {
                cartItem.quantity = variant.maxOrderQuantity;
            }
        } else {
            cartItem = new CartItem({
                userID,
                productID: product._id,
                variantID,
                quantity
            });
        }

        await cartItem.save();
        res.status(200).send({ msg: 'Product added to cart from wishlist successfully', data: cartItem });
    } catch (error) {
        console.error('Error adding product to cart from wishlist:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Update cart item quantity
cartRoute.patch('/update-quantity', verifyToken, async (req, res) => {
    try {
        const { cartItemID, quantity } = req.body;
        const userID = req.userDetail._id;

        const cartItem = await CartItem.findById(cartItemID).populate('productID');
        if (!cartItem || cartItem.userID.toString() !== userID.toString()) {
            return res.status(404).send({ msg: 'Cart item not found' });
        }

        const variant = cartItem.productID.variants.id(cartItem.variantID);
        if (quantity < variant.minOrderQuantity || quantity > variant.maxOrderQuantity) {
            return res.status(400).send({ msg: `Quantity must be between ${variant.minOrderQuantity} and ${variant.maxOrderQuantity}` });
        }

        cartItem.quantity = quantity;
        await cartItem.save();

        res.status(200).send({ msg: 'Cart item quantity updated successfully', data: cartItem });
    } catch (error) {
        console.error('Error updating cart item quantity:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Remove item from cart
cartRoute.delete('/remove/:cartItemID', verifyToken, async (req, res) => {
    try {
        const { cartItemID } = req.params;
        const userID = req.userDetail._id;

        const cartItem = await CartItem.findById(cartItemID);
        if (!cartItem || cartItem.userID.toString() !== userID.toString()) {
            return res.status(404).send({ msg: 'Cart item not found' });
        }

        await CartItem.findByIdAndDelete(cartItemID);

        res.status(200).send({ msg: 'Cart item removed successfully' });
    } catch (error) {
        console.error('Error removing cart item:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Remove all cart items
cartRoute.delete('/remove-all', verifyToken, async (req, res) => {
    try {
        const userID = req.userDetail._id;
        await CartItem.deleteMany({ userID });

        res.status(200).send({ msg: 'All cart items removed successfully' });
    } catch (error) {
        console.error('Error removing all cart items:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Get cart items for user (currency added)
cartRoute.get('/', verifyToken, async (req, res) => {
    try {
        const userID = req.userDetail._id;
        const cartItems = await CartItem.find({ userID }).populate('productID');

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        const country = req.query.country || 'INDIA';
        const currency = req.query.currency || 'INR';

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Adjust prices of cart items based on exchange rate and country selection
        cartItems.forEach(item => {
            const product = item.productID;
            const variant = product.variants.find(v => v._id.toString() === item.variantID.toString());

            const indianMRP = variant.price || 0;
            const indianSaleMRP = variant.salePrice || 0;
            const margin = variant.margin / 100 || 0.01;

            if (country === 'INDIA') {
                if (exchangeRate.rate !== 1) { // Currency other than INR
                    item.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                    item.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                } else {
                    item.price = Number(indianMRP.toFixed(2));
                    item.salePrice = Number(indianSaleMRP.toFixed(2));
                }
            } else { // OUTSIDE INDIA
                const priceWithMargin = indianMRP * (1 + margin);
                const salePriceWithMargin = indianSaleMRP * (1 + margin);

                item.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                item.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
            }
            item.currency = currencySymbol; // Set the currency symbol
        });

        res.status(200).send({ msg: 'Cart items fetched successfully', data: cartItems });
    } catch (error) {
        console.error('Error fetching cart items:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

module.exports = cartRoute;