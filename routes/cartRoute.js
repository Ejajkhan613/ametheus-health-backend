const express = require('express');
const mongoose = require('mongoose');
const verifyToken = require('../middlewares/auth');
const CartItem = require('../models/cartModel');
const Product = require('../models/productModel');
const ExchangeRate = require('../models/currencyPriceModel');
const WishlistItem = require('../models/wishlistModel');

const cartRoute = express.Router();

async function getExchangeRate(currency) {
    const exchangeRate = await ExchangeRate.findOne({ currency });
    if (exchangeRate) {
        return {
            rate: exchangeRate.rate,
            symbol: exchangeRate.symbol || currency
        };
    } else {
        return {
            rate: 1,
            symbol: '₹'
        };
    }
}

// POST route for adding products to cart
cartRoute.post('/', verifyToken, async (req, res) => {
    try {
        const { productID, variantID, quantity = 1, currency = 'INR', country = 'INDIA' } = req.body;
        const userID = req.userDetail._id;

        // Validation checks for product and variant IDs
        if (!productID) {
            return res.status(400).send({ msg: 'Product ID is not provided' });
        }

        if (!variantID) {
            return res.status(400).send({ msg: 'Variant ID is not provided' });
        }

        // Fetch product and variant details from MongoDB
        const product = await Product.findById(productID);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        const variant = product.variants.id(variantID);
        if (!variant) {
            return res.status(404).send({ msg: 'Variant not found for the product' });
        }

        // Quantity validation against minOrderQuantity and maxOrderQuantity
        if (quantity < variant.minOrderQuantity || quantity > variant.maxOrderQuantity) {
            return res.status(400).send({ msg: `Quantity must be between ${variant.minOrderQuantity} and ${variant.maxOrderQuantity}` });
        }

        // Fetch or create the user's cart
        let cart = await CartItem.findOne({ userID });
        if (!cart) {
            cart = new CartItem({ userID, cartDetails: [] });
        }

        // Check if the product variant is already in the cart
        let cartItem = cart.cartDetails.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);

        if (cartItem) {
            // Update quantity if the product variant is already in the cart
            cartItem.quantity += quantity;
            if (cartItem.quantity > variant.maxOrderQuantity) {
                cartItem.quantity = variant.maxOrderQuantity;
            }
        } else {
            cart.cartDetails.push({
                productID,
                variantID,
                quantity,
                productDetail: {
                    _id: product._id,
                    title: product.title,
                    slug: product.slug,
                    images: product.images,
                    genericID: product.genericID,
                    generic: product.generic,
                    treatment: product.treatment,
                    isReturnable: product.isReturnable,
                    isPrescriptionRequired: product.isPrescriptionRequired,
                    isVisible: product.isVisible,
                    isFeatured: product.isFeatured,
                    shortDescription: product.shortDescription,
                    description: product.description,
                    sideEffects: product.sideEffects,
                    faq: product.faq,
                    additionalInformation: product.additionalInformation,
                    moreInformation: product.moreInformation,
                    purchaseNote: product.purchaseNote,
                    categoryID: product.categoryID,
                    tags: product.tags,
                    upSell: product.upSell,
                    crossSell: product.crossSell,
                    externalLink: product.externalLink,
                    position: product.position,
                    manufacturerID: product.manufacturerID,
                    originCountry: product.originCountry,
                    isDiscontinued: product.isDiscontinued,
                    metaTitle: product.metaTitle,
                    metaDescription: product.metaDescription,
                    metaTags: product.metaTags,
                    variants: product.variants,
                },
                variantDetail: {
                    _id: variant._id,
                    sku: variant.sku,
                    price: variant.price,
                    salePrice: variant.salePrice,
                    minOrderQuantity: variant.minOrderQuantity,
                    maxOrderQuantity: variant.maxOrderQuantity,
                    margin: variant.margin,
                    packSize: variant.packSize,
                    isStockAvailable: variant.isStockAvailable,
                    weight: variant.weight,
                    weightUnit: variant.weightUnit,
                    length: variant.length,
                    lengthUnit: variant.lengthUnit,
                    width: variant.width,
                    widthUnit: variant.widthUnit,
                    height: variant.height,
                    heightUnit: variant.heightUnit,
                    currency: variant.currency
                }
            });
        }

        // Fetch exchange rate and currency symbol based on user's selected currency
        const { rate: exchangeRate, symbol: currencySymbol } = await getExchangeRate(currency);

        // Save the updated cart
        await cart.save();

        // Calculate total price based on salePrice or price of each item in the cart
        let totalPrice = 0;
        cart.cartDetails.forEach(item => {
            const itemPrice = (item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price) * (1 + item.variantDetail.margin / 100);
            totalPrice += itemPrice * item.quantity;
        });

        // Convert total price to user's selected currency if not INR
        if (currency !== 'INR') {
            totalPrice *= exchangeRate;
        }

        // Calculate delivery charge based on the country and total price
        let deliveryCharge = 0;

        if (country === 'INDIA') {
            // Delivery charge slab for India
            if (totalPrice >= 0.01 && totalPrice <= 499.99) {
                deliveryCharge = 99 * exchangeRate;
            } else if (totalPrice >= 500 && totalPrice <= 999.99) {
                deliveryCharge = 59 * exchangeRate;
            }
            // Free delivery for orders of 1000 INR or more
        } else {
            // Delivery charge slab for countries outside India
            if (totalPrice >= 0.01 && totalPrice <= 4177.78) {
                deliveryCharge = 4178.62 * exchangeRate;
            } else if (totalPrice >= 4177.79 && totalPrice <= 16713.64) {
                deliveryCharge = 3342.90 * exchangeRate;
            }
            // Free delivery for orders of 16713.65 INR or more
        }

        // Calculate total cart price including delivery charge
        const totalCartPrice = totalPrice + deliveryCharge;

        // Prepare response data
        const responseData = {
            msg: 'Product added to cart successfully',
            data: cart.cartDetails,
            totalPrice: +totalPrice.toFixed(2),
            deliveryCharge: +deliveryCharge.toFixed(2),
            totalCartPrice: +totalCartPrice.toFixed(2),
            currency: currency === 'INR' ? '₹' : currencySymbol
        };

        // Send response
        res.send(responseData);
    } catch (error) {
        console.error('Error adding product to cart:', error);
        res.status(500).send({ msg: 'Server Error', error: error.message });
    }
});

// Add item to cart from wishlist
cartRoute.post('/add-from-wishlist', verifyToken, async (req, res) => {
    try {
        let { wishlistItemID, quantity, currency, country } = req.body;
        const userID = req.userDetail._id;

        // If currency and country are not provided in the body, fallback to defaults
        currency = currency || 'INR';
        country = country || 'INDIA';

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

        let cart = await CartItem.findOne({ userID });

        if (!cart) {
            cart = new CartItem({ userID, cartDetails: [] });
        }

        let cartItem = cart.cartDetails.find(item => item.productID.toString() === product._id.toString() && item.variantID.toString() === variantID.toString());

        if (cartItem) {
            cartItem.quantity += quantity;
            if (cartItem.quantity > variant.maxOrderQuantity) {
                cartItem.quantity = variant.maxOrderQuantity;
            }
        } else {
            cart.cartDetails.push({
                productID: product._id,
                variantID,
                quantity,
                productDetail: {
                    _id: product._id,
                    title: product.title,
                    slug: product.slug,
                    images: product.images,
                    genericID: product.genericID,
                    generic: product.generic,
                    treatment: product.treatment,
                    isReturnable: product.isReturnable,
                    isPrescriptionRequired: product.isPrescriptionRequired,
                    isVisible: product.isVisible,
                    isFeatured: product.isFeatured,
                    shortDescription: product.shortDescription,
                    description: product.description,
                    sideEffects: product.sideEffects,
                    faq: product.faq,
                    additionalInformation: product.additionalInformation,
                    moreInformation: product.moreInformation,
                    purchaseNote: product.purchaseNote,
                    categoryID: product.categoryID,
                    tags: product.tags,
                    upSell: product.upSell,
                    crossSell: product.crossSell,
                    externalLink: product.externalLink,
                    position: product.position,
                    manufacturerID: product.manufacturerID,
                    originCountry: product.originCountry,
                    isDiscontinued: product.isDiscontinued,
                    metaTitle: product.metaTitle,
                    metaDescription: product.metaDescription,
                    metaTags: product.metaTags,
                    variants: product.variants,
                },
                variantDetail: {
                    _id: variant._id,
                    sku: variant.sku,
                    price: variant.price,
                    salePrice: variant.salePrice,
                    minOrderQuantity: variant.minOrderQuantity,
                    maxOrderQuantity: variant.maxOrderQuantity,
                    margin: variant.margin,
                    packSize: variant.packSize,
                    isStockAvailable: variant.isStockAvailable,
                    weight: variant.weight,
                    weightUnit: variant.weightUnit,
                    length: variant.length,
                    lengthUnit: variant.lengthUnit,
                    width: variant.width,
                    widthUnit: variant.widthUnit,
                    height: variant.height,
                    heightUnit: variant.heightUnit,
                    currency: variant.currency
                }
            });
        }

        // Fetch exchange rate based on user's selected currency
        const { rate: exchangeRate, symbol: currencySymbol } = await getExchangeRate(currency);

        await cart.save();

        // Calculate total price
        let totalPrice = 0;

        cart.cartDetails.forEach(item => {
            const itemPrice = (item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price) * (1 + item.variantDetail.margin / 100);
            totalPrice += itemPrice * item.quantity;
        });

        // Convert the total price to the user's selected currency if not INR
        if (currency !== 'INR') {
            totalPrice *= exchangeRate;
        }

        // Calculate delivery charge based on the country and total price
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice >= 0.01 && totalPrice <= 499.99) {
                deliveryCharge = 99 * exchangeRate;
            } else if (totalPrice >= 500 && totalPrice <= 999.99) {
                deliveryCharge = 59 * exchangeRate;
            }
        } else {
            if (totalPrice >= 0.01 && totalPrice <= 4177.78) {
                deliveryCharge = 4178.62 * exchangeRate;
            } else if (totalPrice >= 4177.79 && totalPrice <= 16713.64) {
                deliveryCharge = 3342.90 * exchangeRate;
            }
        }

        // Calculate total cart price
        const totalCartPrice = deliveryCharge + totalPrice;

        res.status(200).send({
            msg: 'Product added to cart from wishlist successfully',
            data: cart.cartDetails,
            totalCartPrice: +totalCartPrice.toFixed(2),
            deliveryCharge: +deliveryCharge.toFixed(2),
            totalPrice: +totalPrice.toFixed(2),
            currency: currency === 'INR' ? '₹' : currencySymbol
        });
    } catch (error) {
        console.error('Error adding product to cart from wishlist:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Update cart item quantity
cartRoute.patch('/', verifyToken, async (req, res) => {
    try {
        let { productID, variantID, quantity, currency, country } = req.body;
        const userID = req.userDetail._id;

        // If currency and country are not provided in the body, fallback to defaults
        currency = currency || 'INR';
        country = country || 'INDIA';

        const cart = await CartItem.findOne({ userID });
        if (!cart) {
            return res.status(404).send({ msg: 'Cart not found' });
        }

        const cartItem = cart.cartDetails.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);
        if (!cartItem) {
            return res.status(404).send({ msg: 'Cart item not found' });
        }

        const product = await Product.findById(productID);
        const variant = product.variants.id(variantID);

        if (quantity < variant.minOrderQuantity || quantity > variant.maxOrderQuantity) {
            return res.status(400).send({ msg: `Quantity must be between ${variant.minOrderQuantity} and ${variant.maxOrderQuantity}` });
        }

        cartItem.quantity = quantity;

        // Fetch exchange rate based on user's selected currency
        const { rate: exchangeRate, symbol: currencySymbol } = await getExchangeRate(currency);

        // Save cart updates
        await cart.save();

        // Calculate total price and delivery charge
        let totalCartPrice = 0;

        cart.cartDetails.forEach(item => {
            const product = item.productDetail;
            const variant = item.variantDetail;

            const indianMRP = variant.price || 0;
            const margin = variant.margin / 100 || 0.01;

            if (country === 'INDIA') {
                // Calculate prices in INR
                item.price = indianMRP;
            } else {
                // Calculate prices for other countries with margin
                const priceWithMargin = indianMRP * (1 + margin);

                item.price = priceWithMargin;
            }

            // Convert price to selected currency
            item.price = item.price * exchangeRate;

            item.currency = currencySymbol; // Set the currency symbol

            // Calculate total price
            totalCartPrice += item.price * item.quantity;
        });

        // Determine delivery charge
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalCartPrice >= 0.01 && totalCartPrice <= 499.99) {
                deliveryCharge = 99;
            } else if (totalCartPrice >= 500 && totalCartPrice <= 999.99) {
                deliveryCharge = 59;
            } else if (totalCartPrice >= 1000) {
                deliveryCharge = 0; // Free delivery
            }
        } else {
            if (totalCartPrice >= 0.01 && totalCartPrice <= 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalCartPrice >= 4177.79 && totalCartPrice <= 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalCartPrice >= 16713.65) {
                deliveryCharge = 0; // Free delivery
            }
        }

        // Convert delivery charge if needed
        deliveryCharge = deliveryCharge * exchangeRate;

        // Calculate total cart price
        const totalPrice = totalCartPrice + deliveryCharge;

        res.status(200).send({
            msg: 'Cart item quantity updated successfully',
            data: cart.cartDetails,
            totalCartPrice: +totalCartPrice.toFixed(2),
            deliveryCharge: +deliveryCharge.toFixed(2),
            totalPrice: +totalPrice.toFixed(2),
            currency: currencySymbol
        });
    } catch (error) {
        console.error('Error updating cart item quantity:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Remove item from cart
cartRoute.delete('/single/', verifyToken, async (req, res) => {
    try {
        const { productID, variantID } = req.body;
        const { currency = 'INR', country = 'INDIA' } = req.body;
        const userID = req.userDetail._id;

        const cart = await CartItem.findOne({ userID });
        if (!cart) {
            return res.status(404).send({ msg: 'Cart not found' });
        }

        const indexToRemove = cart.cartDetails.findIndex(item =>
            item.productID.toString() === productID && item.variantID.toString() === variantID
        );
        if (indexToRemove === -1) {
            return res.status(404).send({ msg: 'Cart item not found' });
        }

        // Remove the item from cartDetails array
        cart.cartDetails.splice(indexToRemove, 1);
        await cart.save();

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Calculate total price, total sale price, and delivery charge after item removal
        let totalPrice = 0;
        let totalSalePrice = 0;

        cart.cartDetails.forEach(item => {
            totalPrice += item.variantDetail.price * item.quantity;
            totalSalePrice += item.variantDetail.salePrice * item.quantity;
        });

        // Convert the total price and sale price to the user's selected currency
        totalPrice = totalPrice * exchangeRate.rate;
        totalSalePrice = totalSalePrice * exchangeRate.rate;

        // Calculate delivery charge based on the country and total price
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice >= 0.01 && totalPrice <= 499.99) {
                deliveryCharge = 99 * exchangeRate.rate;
            } else if (totalPrice >= 500 && totalPrice <= 999.99) {
                deliveryCharge = 59 * exchangeRate.rate;
            }
        } else {
            if (totalPrice >= 0.01 && totalPrice <= 4177.78) {
                deliveryCharge = 4178.62 * exchangeRate.rate;
            } else if (totalPrice >= 4177.79 && totalPrice <= 16713.64) {
                deliveryCharge = 3342.90 * exchangeRate.rate;
            }
        }

        // Calculate total cart price
        const totalCartPrice = deliveryCharge + (totalSalePrice !== 0 ? totalSalePrice : totalPrice);

        // Send the response with updated data
        res.status(200).send({
            msg: 'Cart item removed successfully',
            data: cart.cartDetails, // Updated cart details after removal
            totalPrice: +totalPrice.toFixed(2),
            totalSalePrice: +totalSalePrice.toFixed(2),
            deliveryCharge: +deliveryCharge.toFixed(2),
            totalCartPrice: +totalCartPrice.toFixed(2),
            currency: currencySymbol
        });
    } catch (error) {
        console.error('Error removing cart item:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Remove all cart items
cartRoute.delete('/', verifyToken, async (req, res) => {
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
        const cart = await CartItem.findOne({ userID });

        if (!cart) {
            return res.status(200).send({
                msg: 'Cart items fetched successfully',
                data: [],
                totalCartPrice: 0.00,
                deliveryCharge: 0.00,
                totalPrice: 0.00,
                currency: '₹'
            });
        }

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = 1;
        let currencySymbol = "₹";

        const country = req.query.country || 'INDIA';
        const currency = req.query.currency || 'INR';

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate.rate;
                currencySymbol = foundExchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Calculate total cart price and adjust prices of cart items based on exchange rate and country selection
        let totalPrice = 0;

        cart.cartDetails.forEach(item => {
            const variant = item.variantDetail;

            const indianMRP = variant.price || 0;
            const margin = variant.margin / 100 || 0.01;

            if (country === 'INDIA') {
                if (exchangeRate !== 1) { // Currency other than INR
                    item.price = Number((indianMRP * exchangeRate).toFixed(2));
                } else {
                    item.price = Number(indianMRP.toFixed(2));
                }
            } else { // OUTSIDE INDIA
                const priceWithMargin = indianMRP * (1 + margin);

                item.price = Number((priceWithMargin * exchangeRate).toFixed(2));
            }
            item.currency = currencySymbol; // Set the currency symbol

            // Calculate total price
            totalPrice += item.price * item.quantity;
        });

        // Determine delivery charge
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice >= 0.01 && totalPrice <= 499.99) {
                deliveryCharge = 99;
            } else if (totalPrice >= 500 && totalPrice <= 999.99) {
                deliveryCharge = 59;
            } else if (totalPrice >= 1000) {
                deliveryCharge = 0; // Free delivery
            }
        } else {
            if (totalPrice >= 0.01 && totalPrice <= 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalPrice >= 4177.79 && totalPrice <= 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalPrice >= 16713.65) {
                deliveryCharge = 0; // Free delivery
            }
        }

        // Convert delivery charge if needed
        if (exchangeRate !== 1) {
            deliveryCharge = Number((deliveryCharge * exchangeRate).toFixed(2));
        }

        // Calculate total cart price
        const totalCartPrice = deliveryCharge + totalPrice;

        res.status(200).send({
            msg: 'Cart items fetched successfully',
            data: cart.cartDetails,
            totalCartPrice: +totalCartPrice.toFixed(2),
            deliveryCharge: +deliveryCharge.toFixed(2),
            totalPrice: +totalPrice.toFixed(2),
            currency: currencySymbol
        });
    } catch (error) {
        console.error('Error fetching cart items:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

module.exports = cartRoute;