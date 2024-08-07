const express = require('express');
const verifyToken = require('../middlewares/auth');
const WishlistItem = require('../models/wishlistModel');
const Product = require('../models/productModel');

const wishlistRoute = express.Router();

// Add product variant to wishlist
wishlistRoute.post('/', verifyToken, async (req, res) => {
    const userID = req.userDetail._id;
    const { productID, variantID } = req.body;

    try {
        const product = await Product.findById(productID);
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        const variant = product.variants.id(variantID);
        if (!variant) {
            return res.status(404).json({ msg: 'Variant not found' });
        }

        let wishlist = await WishlistItem.findOne({ userID });
        if (!wishlist) {
            wishlist = new WishlistItem({ userID, items: [{ productID, variantID }] });
        } else {
            const itemExists = wishlist.items.some(item => item.productID.toString() === productID && item.variantID.toString() === variantID);
            if (itemExists) {
                return res.status(400).json({ msg: 'Product variant already in wishlist' });
            }
            wishlist.items.push({ productID, variantID });
        }

        await wishlist.save();
        res.status(200).json({ msg: 'Product variant added to wishlist', data: wishlist });
    } catch (error) {
        console.error('Error adding product variant to wishlist:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Remove product variant from wishlist
wishlistRoute.delete('/', verifyToken, async (req, res) => {
    const userID = req.userDetail._id;
    const { productID, variantID } = req.body;

    try {
        const wishlist = await WishlistItem.findOne({ userID });
        if (!wishlist) {
            return res.status(404).json({ msg: 'Wishlist not found' });
        }

        const itemIndex = wishlist.items.findIndex(item => item.productID.toString() === productID && item.variantID.toString() === variantID);
        if (itemIndex === -1) {
            return res.status(404).json({ msg: 'Product variant not found in wishlist' });
        }

        wishlist.items.splice(itemIndex, 1);
        await wishlist.save();
        res.status(200).json({ msg: 'Product variant removed from wishlist', data: wishlist });
    } catch (error) {
        console.error('Error removing product variant from wishlist:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Get user's wishlist (currency and country added)
wishlistRoute.get('/', verifyToken, async (req, res) => {
    const userID = req.userDetail._id;

    try {
        const wishlist = await WishlistItem.findOne({ userID })
            .populate('items.productID')
            .populate('items.variantID');

        if (!wishlist) {
            return res.status(404).json({ msg: 'Wishlist not found' });
        }

        let { currency = 'INR', country = 'INDIA' } = req.query;
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = foundExchangeRate.symbol || currency;
            } else {
                return res.status(400).json({ msg: 'Currency not supported' });
            }
        }

        // Adjust prices in wishlist items based on exchange rate and country
        wishlist.items.forEach(item => {
            const variant = item.productID.variants.find(v => v._id.equals(item.variantID));

            if (variant) {
                let price = variant.price || 0;
                let salePrice = variant.salePrice || 0;
                const marginPercentage = variant.margin / 100 || 0.01;

                // Apply margin based on country
                if (country === 'INDIA') {
                    const discount = 12 / 100;
                    price = Number((price * (1 - discount)).toFixed(2));
                    salePrice = Number((salePrice * (1 - discount)).toFixed(2));
                } else if (['BANGLADESH', 'NEPAL'].includes(country)) {
                    const margin = 20 / 100;
                    price = Number((price + (price * margin)).toFixed(2));
                    salePrice = Number((salePrice + (salePrice * margin)).toFixed(2));
                } else {
                    price = Number((price + (price * marginPercentage)).toFixed(2));
                    salePrice = Number((salePrice + (salePrice * marginPercentage)).toFixed(2));
                }

                // Convert to selected currency
                price = Number((price * exchangeRate.rate).toFixed(2));
                salePrice = Number((salePrice * exchangeRate.rate).toFixed(2));

                item.price = price;
                item.salePrice = salePrice;
            }

            item.currency = currencySymbol; // Set the currency symbol
        });

        res.status(200).json({ data: wishlist });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});


module.exports = wishlistRoute;