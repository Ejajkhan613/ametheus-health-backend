const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth');
const ProductModel = require('../models/productModel');
const WishlistItem = require('../models/wishlistModel');
const CartModel = require('../models/cartModel');
const ExchangeRateModel = require('../models/currencyPriceModel');

// Add specific product and its variant in cart
router.post('/', verifyToken, async (req, res) => {
    const { productID, variantID, quantity, country = "INDIA", currency = "INR" } = req.body;

    try {
        // Fetch the product by productID
        const product = await ProductModel.findById(productID);

        // Check if the product is found
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Find the specific variant in the product
        const variant = product.variants.id(variantID);

        // Check if the variant is found
        if (!variant) {
            return res.status(404).json({ message: 'Variant not found' });
        }

        // Check if the product and variant meet the required conditions
        if (!variant.isStockAvailable || variant.price === 0 || !product.isVisible) {
            return res.status(400).json({ message: 'This Medicine cannot be added to the cart due to stock, price, or visibility constraints' });
        }

        // Check if the quantity is within the specified limits
        if (quantity < variant.minOrderQuantity || quantity > variant.maxOrderQuantity) {
            return res.status(400).json({ message: `Quantity must be between ${variant.minOrderQuantity} and ${variant.maxOrderQuantity}` });
        }

        // Find or create a cart for the user
        let cart = await CartModel.findOne({ userID: req.userDetail._id });

        // If cart is not found then create a new cart
        if (!cart) {
            cart = new CartModel({ userID: req.userDetail._id, cartDetails: [] });
        }

        // Find if the product and variant already exist in the cart
        const cartItem = cart.cartDetails.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);

        if (cartItem) {
            // Update the quantity if the item already exists in the cart
            cartItem.quantity = quantity;
        } else {
            // Add the new item to the cart
            cart.cartDetails.push({
                productID,
                variantID,
                quantity,
                productDetail: {
                    title: product.title,
                    slug: product.slug,
                    generic: product.generic,
                    treatment: product.treatment,
                    isReturnable: product.isReturnable,
                    isPrescriptionRequired: product.isPrescriptionRequired,
                    isVisible: product.isVisible,
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
                },
                variantDetail: {
                    sku: variant.sku,
                    packSize: variant.packSize,
                    isStockAvailable: variant.isStockAvailable,
                    currency: variant.currency,
                    price: variant.price,
                    salePrice: variant.salePrice,
                    margin: variant.margin,
                    minOrderQuantity: variant.minOrderQuantity,
                    maxOrderQuantity: variant.maxOrderQuantity,
                    weight: variant.weight,
                    weightUnit: variant.weightUnit,
                    length: variant.length,
                    lengthUnit: variant.lengthUnit,
                    width: variant.width,
                    widthUnit: variant.widthUnit,
                    height: variant.height,
                    heightUnit: variant.heightUnit,
                }
            });
        }

        // Calculate the total price of the cart
        let totalPrice = cart.cartDetails.reduce((total, item) => {
            let itemPrice;

            if (country === 'INDIA') {
                itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
            } else {
                // For non-India, calculate price with margin
                itemPrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice + (item.variantDetail.salePrice * item.variantDetail.margin / 100)) : (item.variantDetail.price + (item.variantDetail.price * item.variantDetail.margin / 100));
            }

            return total + itemPrice * item.quantity;
        }, 0);

        // Determine delivery charge based on country
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice > 0 && totalPrice < 500) {
                deliveryCharge = 99;
            } else if (totalPrice >= 500 && totalPrice < 1000) {
                deliveryCharge = 59;
            } else if (totalPrice >= 1000) {
                deliveryCharge = 0;
            }
        } else {
            if (totalPrice > 0 && totalPrice < 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalPrice >= 4177.78 && totalPrice < 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalPrice >= 16713.65) {
                deliveryCharge = 0;
            }
        }

        // Fetch exchange rate for the selected currency
        let deliveryChargeInCurrency = deliveryCharge;
        let symbol = '₹';
        if (currency !== 'INR') {
            const exchangeRate = await ExchangeRateModel.findOne({ currency: currency });
            if (!exchangeRate) {
                return res.status(404).json({ message: 'Exchange rate not found for the selected currency' });
            }
            // Convert delivery charge to the selected currency
            deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);

            // Convert total price to the selected currency
            totalPrice = (totalPrice * exchangeRate.rate).toFixed(2);
            totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

            symbol = exchangeRate.currency == 'AED' ? exchangeRate.currency : exchangeRate.symbol;
        } else {
            // Calculate total cart price in INR
            totalCartPrice = (totalPrice + deliveryCharge).toFixed(2);
        }

        // Convert numbers to strings with two decimal places
        totalPrice = parseFloat(totalPrice).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);
        totalCartPrice = parseFloat(totalCartPrice).toFixed(2);

        // Save the updated cart without storing the calculated prices
        await cart.save();

        // Send the response with calculated prices and currency
        res.status(200).json({
            message: 'Product added to cart successfully',
            cart: {
                ...cart.toObject(),
                totalPrice: totalPrice.toString(),
                deliveryCharge: deliveryChargeInCurrency.toString(),
                totalCartPrice: totalCartPrice.toString(),
                currency: symbol
            }
        });

    } catch (error) {
        console.log("Error while adding Product in Cart", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all cart details with prices
router.get('/', verifyToken, async (req, res) => {
    const { country = "INDIA", currency = "INR" } = req.query;

    try {
        // Find the user's cart
        const cart = await CartModel.findOne({ userID: req.userDetail._id });

        // Check if the cart is found
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Calculate the total price of the cart
        let totalPrice = cart.cartDetails.reduce((total, item) => {
            let itemPrice;

            if (country === 'INDIA') {
                itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
            } else {
                // For non-India, calculate price with margin
                itemPrice = item.variantDetail.salePrice !== 0 ?
                    (item.variantDetail.salePrice + (item.variantDetail.salePrice * item.variantDetail.margin / 100)) :
                    (item.variantDetail.price + (item.variantDetail.price * item.variantDetail.margin / 100));
            }

            return total + itemPrice * item.quantity;
        }, 0);

        // Determine delivery charge based on country
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice > 0 && totalPrice < 500) {
                deliveryCharge = 99;
            } else if (totalPrice >= 500 && totalPrice < 1000) {
                deliveryCharge = 59;
            } else if (totalPrice >= 1000) {
                deliveryCharge = 0;
            }
        } else {
            if (totalPrice > 0 && totalPrice < 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalPrice >= 4177.78 && totalPrice < 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalPrice >= 16713.65) {
                deliveryCharge = 0;
            }
        }

        // Fetch exchange rate for the selected currency
        let deliveryChargeInCurrency = deliveryCharge;
        let symbol = '₹';
        if (currency !== 'INR') {
            const exchangeRate = await ExchangeRateModel.findOne({ currency: currency });
            if (!exchangeRate) {
                return res.status(404).json({ message: 'Exchange rate not found for the selected currency' });
            }
            // Convert delivery charge to the selected currency
            deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);

            // Convert total price to the selected currency
            totalPrice = (totalPrice * exchangeRate.rate).toFixed(2);
            totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

            symbol = exchangeRate.currency === 'AED' ? exchangeRate.currency : exchangeRate.symbol;
        } else {
            // Calculate total cart price in INR
            totalCartPrice = (totalPrice + deliveryCharge).toFixed(2);
        }

        // Convert numbers to strings with two decimal places
        totalPrice = parseFloat(totalPrice).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);
        totalCartPrice = parseFloat(totalCartPrice).toFixed(2);

        // Send the response with calculated prices and currency
        res.status(200).json({
            message: 'Cart retrieved successfully',
            cart: {
                ...cart.toObject(),
                totalPrice: totalPrice.toString(),
                deliveryCharge: deliveryChargeInCurrency.toString(),
                totalCartPrice: totalCartPrice.toString(),
                currency: symbol
            }
        });

    } catch (error) {
        console.log("Error while retrieving the cart", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete specific product and its variant from cart
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { country = "INDIA", currency = "INR" } = req.query;

    try {
        // Find the user's cart
        const cart = await CartModel.findOne({ userID: req.userDetail._id });

        // Check if the cart is found
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Find the index of the cartDetails object to be removed
        const itemIndex = cart.cartDetails.findIndex(item => item._id.toString() === id);

        // Check if the item exists in the cart
        if (itemIndex === -1) {
            return res.status(404).json({ message: 'Item not found in the cart' });
        }

        // Remove the item from the cartDetails array
        cart.cartDetails.splice(itemIndex, 1);

        // Calculate the total price of the cart
        let totalPrice = cart.cartDetails.reduce((total, item) => {
            let itemPrice;

            if (country === 'INDIA') {
                itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
            } else {
                // For non-India, calculate price with margin
                itemPrice = item.variantDetail.salePrice !== 0 ?
                    (item.variantDetail.salePrice + (item.variantDetail.salePrice * item.variantDetail.margin / 100)) :
                    (item.variantDetail.price + (item.variantDetail.price * item.variantDetail.margin / 100));
            }

            return total + itemPrice * item.quantity;
        }, 0);

        // Determine delivery charge based on country
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice > 0 && totalPrice < 500) {
                deliveryCharge = 99;
            } else if (totalPrice >= 500 && totalPrice < 1000) {
                deliveryCharge = 59;
            } else if (totalPrice >= 1000) {
                deliveryCharge = 0;
            }
        } else {
            if (totalPrice > 0 && totalPrice < 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalPrice >= 4177.78 && totalPrice < 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalPrice >= 16713.65) {
                deliveryCharge = 0;
            }
        }

        // Fetch exchange rate for the selected currency
        let deliveryChargeInCurrency = deliveryCharge;
        let symbol = '₹';
        if (currency !== 'INR') {
            const exchangeRate = await ExchangeRateModel.findOne({ currency: currency });
            if (!exchangeRate) {
                return res.status(404).json({ message: 'Exchange rate not found for the selected currency' });
            }
            // Convert delivery charge to the selected currency
            deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);

            // Convert total price to the selected currency
            totalPrice = (totalPrice * exchangeRate.rate).toFixed(2);
            totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

            symbol = exchangeRate.currency === 'AED' ? exchangeRate.currency : exchangeRate.symbol;
        } else {
            // Calculate total cart price in INR
            totalCartPrice = (totalPrice + deliveryCharge).toFixed(2);
        }

        // Convert numbers to strings with two decimal places
        totalPrice = parseFloat(totalPrice).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);
        totalCartPrice = parseFloat(totalCartPrice).toFixed(2);

        // Save the updated cart
        await cart.save();

        // Send the response with the updated cart and calculated prices
        res.status(200).json({
            message: 'Item removed from cart successfully',
            cart: {
                ...cart.toObject(),
                totalPrice: totalPrice.toString(),
                deliveryCharge: deliveryChargeInCurrency.toString(),
                totalCartPrice: totalCartPrice.toString(),
                currency: symbol
            }
        });

    } catch (error) {
        console.log("Error while removing item from cart", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete all the cart
router.delete('/', verifyToken, async (req, res) => {
    try {
        // Find and delete the user's cart
        const result = await CartModel.deleteOne({ userID: req.userDetail._id });

        // Check if the cart was deleted
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Send success response
        res.status(200).json({ message: 'Cart deleted successfully' });
    } catch (error) {
        console.log("Error while deleting the cart", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Add a single item from the wishlist to the cart
router.post('/add-from-wishlist', verifyToken, async (req, res) => {
    const userID = req.userDetail._id;
    const { productID, variantID, country = 'INDIA', currency = 'INR' } = req.body;

    try {
        const wishlist = await WishlistItem.findOne({ userID });

        if (!wishlist) {
            return res.status(404).json({ msg: 'Wishlist not found' });
        }

        const wishlistItem = wishlist.items.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);

        if (!wishlistItem) {
            return res.status(404).json({ msg: 'Item not found in wishlist' });
        }

        const product = await Product.findById(productID);
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        const variant = product.variants.id(variantID);
        if (!variant) {
            return res.status(404).json({ msg: 'Variant not found' });
        }

        let cart = await CartModel.findOne({ userID });
        if (!cart) {
            cart = new CartModel({ userID, cartDetails: [{ productID, variantID, quantity: 1 }] });
        } else {
            const itemExists = cart.cartDetails.some(item => item.productID.toString() === productID && item.variantID.toString() === variantID);
            if (itemExists) {
                return res.status(400).json({ msg: 'Product variant already in cart' });
            }
            cart.cartDetails.push({ productID, variantID, quantity: 1 });
        }

        await cart.save();

        // Calculate the total price of the cart
        let totalPrice = cart.cartDetails.reduce((total, item) => {
            let itemPrice;

            if (country === 'INDIA') {
                itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
            } else {
                // For non-India, calculate price with margin
                itemPrice = item.variantDetail.salePrice !== 0 ?
                    (item.variantDetail.salePrice + (item.variantDetail.salePrice * item.variantDetail.margin / 100)) :
                    (item.variantDetail.price + (item.variantDetail.price * item.variantDetail.margin / 100));
            }

            return total + itemPrice * item.quantity;
        }, 0);

        // Determine delivery charge based on country
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice > 0 && totalPrice < 500) {
                deliveryCharge = 99;
            } else if (totalPrice >= 500 && totalPrice < 1000) {
                deliveryCharge = 59;
            } else if (totalPrice >= 1000) {
                deliveryCharge = 0;
            }
        } else {
            if (totalPrice > 0 && totalPrice < 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalPrice >= 4177.78 && totalPrice < 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalPrice >= 16713.65) {
                deliveryCharge = 0;
            }
        }

        // Fetch exchange rate for the selected currency
        let deliveryChargeInCurrency = deliveryCharge;
        let symbol = '₹';
        if (currency !== 'INR') {
            const exchangeRate = await ExchangeRateModel.findOne({ currency: currency });
            if (!exchangeRate) {
                return res.status(404).json({ msg: 'Exchange rate not found for the selected currency' });
            }
            // Convert delivery charge to the selected currency
            deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);

            // Convert total price to the selected currency
            totalPrice = (totalPrice * exchangeRate.rate).toFixed(2);
            totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

            symbol = exchangeRate.currency === 'AED' ? exchangeRate.currency : exchangeRate.symbol;
        } else {
            // Calculate total cart price in INR
            totalCartPrice = (totalPrice + deliveryCharge).toFixed(2);
        }

        // Convert numbers to strings with two decimal places
        totalPrice = parseFloat(totalPrice).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);
        totalCartPrice = parseFloat(totalCartPrice).toFixed(2);

        // Send the response with calculated prices and currency
        res.status(200).json({
            msg: 'Product variant added to cart from wishlist',
            data: cart,
            totalPrice: totalPrice.toString(),
            deliveryCharge: deliveryChargeInCurrency.toString(),
            totalCartPrice: totalCartPrice.toString(),
            currency: symbol
        });
    } catch (error) {
        console.error('Error adding product variant from wishlist to cart:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Add a single item from the wishlist to the cart
router.post('/add-from-wishlist', verifyToken, async (req, res) => {
    const userID = req.userDetail._id;
    const { productID, variantID, country = 'INDIA', currency = 'INR' } = req.body;

    try {
        const wishlist = await WishlistItem.findOne({ userID });

        if (!wishlist) {
            return res.status(404).json({ msg: 'Wishlist not found' });
        }

        const wishlistItem = wishlist.items.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);

        if (!wishlistItem) {
            return res.status(404).json({ msg: 'Item not found in wishlist' });
        }

        const product = await ProductModel.findById(productID);
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        const variant = product.variants.id(variantID);
        if (!variant) {
            return res.status(404).json({ msg: 'Variant not found' });
        }

        let cart = await CartModel.findOne({ userID });
        if (!cart) {
            cart = new CartModel({ userID, cartDetails: [] });
        }

        const itemExists = cart.cartDetails.some(item => item.productID.toString() === productID && item.variantID.toString() === variantID);
        if (itemExists) {
            return res.status(400).json({ msg: 'Product variant already in cart' });
        }

        cart.cartDetails.push({
            productID,
            variantID,
            quantity: 1,  // Assuming default quantity of 1
            productDetail: {
                title: product.title,
                slug: product.slug,
                generic: product.generic,
                treatment: product.treatment,
                isReturnable: product.isReturnable,
                isPrescriptionRequired: product.isPrescriptionRequired,
                isVisible: product.isVisible,
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
            },
            variantDetail: {
                sku: variant.sku,
                packSize: variant.packSize,
                isStockAvailable: variant.isStockAvailable,
                currency: variant.currency,
                price: variant.price,
                salePrice: variant.salePrice,
                margin: variant.margin,
                minOrderQuantity: variant.minOrderQuantity,
                maxOrderQuantity: variant.maxOrderQuantity,
                weight: variant.weight,
                weightUnit: variant.weightUnit,
                length: variant.length,
                lengthUnit: variant.lengthUnit,
                width: variant.width,
                widthUnit: variant.widthUnit,
                height: variant.height,
                heightUnit: variant.heightUnit,
            }
        });

        // Calculate the total price of the cart
        let totalPrice = cart.cartDetails.reduce((total, item) => {
            let itemPrice;

            if (country === 'INDIA') {
                itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
            } else {
                // For non-India, calculate price with margin
                itemPrice = item.variantDetail.salePrice !== 0 ?
                    (item.variantDetail.salePrice + (item.variantDetail.salePrice * item.variantDetail.margin / 100)) :
                    (item.variantDetail.price + (item.variantDetail.price * item.variantDetail.margin / 100));
            }

            return total + itemPrice * item.quantity;
        }, 0);

        // Determine delivery charge based on country
        let deliveryCharge = 0;
        if (country === 'INDIA') {
            if (totalPrice > 0 && totalPrice < 500) {
                deliveryCharge = 99;
            } else if (totalPrice >= 500 && totalPrice < 1000) {
                deliveryCharge = 59;
            } else if (totalPrice >= 1000) {
                deliveryCharge = 0;
            }
        } else {
            if (totalPrice > 0 && totalPrice < 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalPrice >= 4177.78 && totalPrice < 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalPrice >= 16713.65) {
                deliveryCharge = 0;
            }
        }

        // Fetch exchange rate for the selected currency
        let deliveryChargeInCurrency = deliveryCharge;
        let symbol = '₹';
        if (currency !== 'INR') {
            const exchangeRate = await ExchangeRateModel.findOne({ currency: currency });
            if (!exchangeRate) {
                return res.status(404).json({ message: 'Exchange rate not found for the selected currency' });
            }
            // Convert delivery charge to the selected currency
            deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);

            // Convert total price to the selected currency
            totalPrice = (totalPrice * exchangeRate.rate).toFixed(2);
            totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

            symbol = exchangeRate.currency === 'AED' ? exchangeRate.currency : exchangeRate.symbol;
        } else {
            // Calculate total cart price in INR
            totalCartPrice = (totalPrice + deliveryCharge).toFixed(2);
        }

        // Convert numbers to strings with two decimal places
        totalPrice = parseFloat(totalPrice).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);
        totalCartPrice = parseFloat(totalCartPrice).toFixed(2);

        // Save the updated cart
        await cart.save();

        // Send the response with calculated prices and currency
        res.status(200).json({
            message: 'Item added to cart successfully',
            cart: {
                ...cart.toObject(),
                totalPrice: totalPrice.toString(),
                deliveryCharge: deliveryChargeInCurrency.toString(),
                totalCartPrice: totalCartPrice.toString(),
                currency: symbol
            }
        });

    } catch (error) {
        console.log("Error while adding item from wishlist to cart", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});



module.exports = router;