// routes/cartRoute.js
const express = require('express');
const mongoose = require('mongoose');
const verifyToken = require('../middlewares/auth');
const CartItem = require('../models/cartModel');
const Product = require('../models/productModel');
const WishlistItem = require('../models/wishlistModel');

const cartRoute = express.Router();

// Add item to cart from product list
cartRoute.post('/add', verifyToken, async (req, res) => {
    try {
        const { productID, variantID, quantity } = req.body;
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

// Get cart items for user
cartRoute.get('/', verifyToken, async (req, res) => {
    try {
        const userID = req.userDetail._id;
        const cartItems = await CartItem.find({ userID }).populate('productID');

        res.status(200).send({ msg: 'Cart items fetched successfully', data: cartItems });
    } catch (error) {
        console.error('Error fetching cart items:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

module.exports = cartRoute;