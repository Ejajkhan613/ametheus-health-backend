const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth');
const ProductModel = require('../models/productModel');
const WishlistItem = require('../models/wishlistModel');
const CartModel = require('../models/cartModel');
const ExchangeRate = require('../models/currencyPriceModel');

// Route to process multiple products (Not Authorized)
router.post('/batch', async (req, res) => {
    const { itemss } = req.body;

    try {
        let cartDetails = [];

        // Process each item in the batch
        for (const { productID, variantID, quantity } of itemss) {
            // Fetch the product by productID
            const product = await ProductModel.findById(productID);
            if (!product) {
                continue;
            }

            // Find the specific variant in the product
            const variant = product.variants.id(variantID);
            if (!variant) {
                continue;
            }

            // Check if the product and variant meet the required conditions
            if (variant.isStockAvailable == false) {
                continue;
            }

            if (variant.price === 0) {
                continue;
            }

            if (product.isVisible === false) {
                continue;
            }

            if (product.isDiscontinued === true) {
                continue;
            }

            if (quantity < variant.minOrderQuantity) {
                continue;
            }

            if (quantity > variant.maxOrderQuantity) {
                continue;
            }

            // Prepare the payload for valid items
            let payload = {
                productID,
                variantID,
                quantity,
                productDetail: {
                    title: product.title,
                    slug: product.slug,
                    images: product.images,
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
                    price: variant.price, // Direct price without conversion
                    salePrice: variant.salePrice !== 0 ? variant.salePrice : 0,
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
            };

            // Add valid payload to the cartDetails array
            cartDetails.push(payload);
        }

        // Send success response
        res.status(200).json({
            msg: 'Success',
            data: cartDetails
        });

    } catch (error) {
        console.error('Error while processing batch request:', error);
        res.status(500).json({ message: 'Error while processing batch request' });
    }
});

// Route to process multiple products (Not Authorized)
router.post('/batch-loggedin', verifyToken, async (req, res) => {
    const { itemss } = req.body;
    const userId = req.userDetail._id;

    try {
        let cartDetails = [];

        // Process each item in the batch
        for (const { productID, variantID, quantity } of itemss) {
            // Fetch the product by productID
            let product = await ProductModel.findById(productID);
            if (!product) {
                continue;
            }
            console.log(productID);

            // Find the specific variant in the product
            let variant = product.variants.id(variantID);
            if (!variant) {
                continue;
            }

            // Check if the product and variant meet the required conditions
            if (variant.isStockAvailable == false) {
                continue;
            }

            if (variant.price === 0 && variant.salePrice) {
                continue;
            }

            if (product.isVisible === false) {
                continue;
            }

            if (product.isDiscontinued === true) {
                continue;
            }

            if (quantity < variant.minOrderQuantity) {
                continue;
            }

            if (quantity > variant.maxOrderQuantity) {
                continue;
            }

            // Prepare the payload for valid items
            let payload = {
                productID,
                variantID,
                quantity,
                productDetail: {
                    title: product.title,
                    slug: product.slug,
                    images: product.images,
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
                    price: variant.price, // Direct price without conversion
                    salePrice: variant.salePrice !== 0 ? variant.salePrice : 0,
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
            };

            // Add valid payload to the cartDetails array
            cartDetails.push(payload);
        }

        // Upsert or update cart details if no errors
        let dataaa = await CartModel.findOneAndUpdate({ userID: userId }, { cartDetails }, { upsert: true, new: true });
        console.log(dataaa);
        // Send success response
        res.status(200).json({
            msg: 'Success'
        });

    } catch (error) {
        console.error('Error while processing batch request:', error);
        res.status(500).json({ message: 'Error while processing batch request' });
    }
});

// Calculate the converted price and salePrice for cart items
router.post('/', verifyToken, async (req, res) => {
    const { productID, variantID, quantity, country, currency } = req.body;

    if (country == "null" || country == "undefined" || country == null || country == undefined) {
        country = 'INDIA';
    }

    if (currency == "null" || currency == "undefined" || currency == null || currency == undefined) {
        currency = 'INR';
    }

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
        if (!variant.isStockAvailable || variant.price === 0 || !product.isVisible || product.isDiscontinued) {
            return res.status(400).json({ message: 'This Medicine cannot be added due to stock, price, or visibility constraints' });
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
        let cartItem = cart.cartDetails.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);

        if (cartItem) {
            // Update the quantity if the item already exists in the cart
            cartItem.quantity = quantity;
            // Update the product and variant details
            cartItem.productDetail = { ...product.toObject() };
            cartItem.variantDetail = { ...variant.toObject() };
        } else {
            // Add the new item to the cart
            cart.cartDetails.push({
                productID,
                variantID,
                quantity,
                productDetail: {
                    title: product.title,
                    slug: product.slug,
                    images: product.images,
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

        // Fetch exchange rate for the selected currency if it's not INR
        let exchangeRate = { rate: 1, symbol: '₹' }; // Default for INR
        if (currency !== 'INR') {
            exchangeRate = await ExchangeRate.findOne({ currency: currency });
            if (!exchangeRate) {
                return res.status(404).json({ message: 'Exchange rate not found for the selected currency' });
            }
        }

        // Calculate the total price of the cart in INR
        let totalPriceInINR = cart.cartDetails.reduce((total, item) => {
            let marginValue = item.variantDetail.margin / 100;

            // Use base price (salePrice or price) for calculation
            let itemPrice;
            if (country === "INDIA") {
                // Apply discount in India
                const discount = 12 / 100;
                itemPrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice * (1 - discount)) : (item.variantDetail.price * (1 - discount));
            } else {
                // NON-INDIA
                let marginPercentage = item.variantDetail.margin / 100;
                if (['BANGLADESH', 'NEPAL'].includes(country)) {
                    marginPercentage = 20 / 100; // Specific margin for Bangladesh and Nepal
                }
                itemPrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice + (item.variantDetail.salePrice * marginPercentage)) : (item.variantDetail.price + (item.variantDetail.price * marginPercentage));
            }

            const value = parseFloat(itemPrice) * item.quantity;
            total += value;
            return total;
        }, 0);

        totalPriceInINR = totalPriceInINR <= 0 ? 0.1 : totalPriceInINR;

        // Determine delivery charge based on total price in INR
        let deliveryChargeInINR = 0;
        if (country === 'INDIA') {
            if (totalPriceInINR > 0 && totalPriceInINR < 500) {
                deliveryChargeInINR = 99;
            } else if (totalPriceInINR >= 500 && totalPriceInINR < 1000) {
                deliveryChargeInINR = 59;
            } else if (totalPriceInINR >= 1000) {
                deliveryChargeInINR = 0;
            }
        } else if (['BANGLADESH', 'NEPAL'].includes(country)) {
            deliveryChargeInINR = 3107;
        } else {
            if (totalPriceInINR > 0 && totalPriceInINR < 4177.78) {
                deliveryChargeInINR = 4178.62;
            } else if (totalPriceInINR >= 4177.78 && totalPriceInINR < 16713.64) {
                deliveryChargeInINR = 3342.90;
            } else if (totalPriceInINR >= 16713.65) {
                deliveryChargeInINR = 0;
            }
        }

        // Convert delivery charge to the selected currency
        let deliveryChargeInCurrency = deliveryChargeInINR;
        if (currency !== 'INR') {
            deliveryChargeInCurrency = (deliveryChargeInINR * exchangeRate.rate).toFixed(2);
        }

        // Calculate total cart price in selected currency
        const totalCartPriceInCurrency = (parseFloat(totalPriceInINR) + parseFloat(deliveryChargeInINR) * exchangeRate.rate).toFixed(2);

        // Convert numbers to strings with two decimal places
        let totalPrice = (parseFloat(totalPriceInINR) * exchangeRate.rate).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);

        // Update cart details with converted prices and currency symbol
        cart.cartDetails = cart.cartDetails.map(item => {
            let convertedPrice = item.variantDetail.price;
            let convertedSalePrice = item.variantDetail.salePrice;

            if (country === "INDIA") {
                if (currency !== "INR") {
                    convertedPrice = (item.variantDetail.price * exchangeRate.rate).toFixed(2);
                    convertedSalePrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice * exchangeRate.rate).toFixed(2) : 0;
                }
            } else {
                // NON-INDIA
                const marginPercentage = item.variantDetail.margin / 100;

                // Apply specific margin for Bangladesh and Nepal
                if (['BANGLADESH', 'NEPAL'].includes(country)) {
                    convertedPrice = (item.variantDetail.price + (item.variantDetail.price * 0.20)).toFixed(2); // 20% margin
                    convertedSalePrice = (item.variantDetail.salePrice + (item.variantDetail.salePrice * 0.20)).toFixed(2); // 20% margin
                } else {
                    convertedPrice = ((item.variantDetail.price + (item.variantDetail.price * marginPercentage))).toFixed(2);
                    convertedSalePrice = ((item.variantDetail.salePrice + (item.variantDetail.salePrice * marginPercentage))).toFixed(2);
                }

                if (currency !== "INR") {
                    convertedPrice = (convertedPrice * exchangeRate.rate).toFixed(2);
                    convertedSalePrice = (convertedSalePrice * exchangeRate.rate).toFixed(2);
                }
            }

            return {
                ...item,
                variantDetail: {
                    ...item.variantDetail,
                    price: convertedPrice,
                    salePrice: convertedSalePrice,
                    currency: exchangeRate.symbol,
                    currencyCode: currency
                }
            };
        });

        // Save the updated cart
        await cart.save();

        // Send response
        res.status(200).json({
            cart: cart.cartDetails,
            totalPrice,
            deliveryCharge: deliveryChargeInCurrency,
            totalCartPrice: totalCartPriceInCurrency,
            currency: exchangeRate.symbol
        });

    } catch (error) {
        console.error('Error while adding product to cart:', error);
        res.status(500).json({ message: 'Error while adding product to cart' });
    }
});

// Get all cart details with prices
router.get('/', verifyToken, async (req, res) => {
    let { country, currency } = req.query;

    try {
        if (country == "null" || country == "undefined" || country == null || country == undefined) {
            country = 'INDIA';
        }

        if (currency == "null" || currency == "undefined" || currency == null || currency == undefined) {
            currency = 'INR';
        }

        // Fetch exchange rate for the selected currency if it's not INR
        let exchangeRate = { rate: 1, symbol: '₹' };
        if (currency !== 'INR') {
            exchangeRate = await ExchangeRate.findOne({ currency: currency });
            if (!exchangeRate) {
                return res.status(404).json({ message: 'Exchange rate not found for the selected currency' });
            }
        }

        // Find the user's cart
        const cart = await CartModel.findOne({ userID: req.userDetail._id });
        if (!cart) return res.status(200).json({
            message: "Cart is Empty",
            cart: {
                "userID": "66a72535debeabdee6646f1f",
                "cartDetails": [],
                "totalPrice": "00.00",
                "deliveryCharge": "00.00",
                "totalCartPrice": "00.00",
                "currency": exchangeRate.symbol,
                "currencyCode": currency,
                country
            }
        });


        // Update cart details with the latest product and variant information
        for (let item of cart.cartDetails) {
            const product = await ProductModel.findById(item.productID);
            if (product) {
                const variant = product.variants.id(item.variantID);
                if (variant) {
                    item.productDetail = { ...product.toObject() };
                    item.variantDetail = { ...variant.toObject() };
                } else {
                    // If the variant is not found, remove the item from the cart
                    cart.cartDetails = cart.cartDetails.filter(cartItem => cartItem._id.toString() !== item._id.toString());
                }
            } else {
                // If the product is not found, remove the item from the cart
                cart.cartDetails = cart.cartDetails.filter(cartItem => cartItem._id.toString() !== item._id.toString());
            }
        }

        // Calculate the total price of the cart in INR
        let totalPriceInINR = cart.cartDetails.reduce((total, item) => {
            let marginValue = item.variantDetail.margin / 100;

            // Use base price (salePrice or price) for calculation
            let itemPrice;
            if (country === "INDIA") {
                // Apply discount in India
                const discount = 12 / 100;
                itemPrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice * (1 - discount)) : (item.variantDetail.price * (1 - discount));
            } else {
                // NON-INDIA
                let marginPercentage = item.variantDetail.margin / 100;
                if (['BANGLADESH', 'NEPAL'].includes(country)) {
                    marginPercentage = 20 / 100; // Specific margin for Bangladesh and Nepal
                }
                itemPrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice + (item.variantDetail.salePrice * marginPercentage)) : (item.variantDetail.price + (item.variantDetail.price * marginPercentage));
            }

            const value = parseFloat(itemPrice) * item.quantity;
            total += value;
            return total;
        }, 0);

        totalPriceInINR = totalPriceInINR <= 0 ? 0.1 : totalPriceInINR;

        // Determine delivery charge based on total price in INR
        let deliveryChargeInINR = 0;
        if (country === 'INDIA') {
            if (totalPriceInINR > 0 && totalPriceInINR < 500) {
                deliveryChargeInINR = 99;
            } else if (totalPriceInINR >= 500 && totalPriceInINR < 1000) {
                deliveryChargeInINR = 59;
            } else if (totalPriceInINR >= 1000) {
                deliveryChargeInINR = 0;
            }
        } else if (['BANGLADESH', 'NEPAL'].includes(country)) {
            deliveryChargeInINR = 3107;
        } else {
            if (totalPriceInINR > 0 && totalPriceInINR < 4177.78) {
                deliveryChargeInINR = 4178.62;
            } else if (totalPriceInINR >= 4177.78 && totalPriceInINR < 16713.64) {
                deliveryChargeInINR = 3342.90;
            } else if (totalPriceInINR >= 16713.65) {
                deliveryChargeInINR = 0;
            }
        }

        // Convert delivery charge to the selected currency
        let deliveryChargeInCurrency = deliveryChargeInINR;
        if (currency !== 'INR') {
            deliveryChargeInCurrency = deliveryChargeInINR * exchangeRate.rate;
        }


        // Calculate total cart price in selected currency
        const totalCartPrice = parseFloat(totalPriceInINR) + parseFloat(deliveryChargeInINR);
        const totalCartPriceInCurrency = (totalCartPrice * exchangeRate.rate).toFixed(2);

        // Convert numbers to strings with two decimal places
        let totalPrice = (parseFloat(totalPriceInINR) * exchangeRate.rate).toFixed(2);


        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);

        // Update cart details with converted prices and currency symbol
        cart.cartDetails = cart.cartDetails.map(item => {
            let convertedPrice = item.variantDetail.price;
            let convertedSalePrice = item.variantDetail.salePrice;

            if (country === "INDIA") {
                if (currency !== "INR") {
                    convertedPrice = (item.variantDetail.price * exchangeRate.rate).toFixed(2);
                    convertedSalePrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice * exchangeRate.rate).toFixed(2) : 0;
                }
            } else {
                // NON-INDIA
                const marginPercentage = item.variantDetail.margin / 100;

                // Apply specific margin for Bangladesh and Nepal
                if (['BANGLADESH', 'NEPAL'].includes(country)) {
                    convertedPrice = (item.variantDetail.price + (item.variantDetail.price * 0.20)).toFixed(2); // 20% margin
                    convertedSalePrice = (item.variantDetail.salePrice + (item.variantDetail.salePrice * 0.20)).toFixed(2); // 20% margin
                } else {
                    convertedPrice = ((item.variantDetail.price + (item.variantDetail.price * marginPercentage))).toFixed(2);
                    convertedSalePrice = ((item.variantDetail.salePrice + (item.variantDetail.salePrice * marginPercentage))).toFixed(2);
                }

                if (currency !== "INR") {
                    convertedPrice = (convertedPrice * exchangeRate.rate).toFixed(2);
                    convertedSalePrice = (convertedSalePrice * exchangeRate.rate).toFixed(2);
                }
            }

            return {
                ...item,
                variantDetail: {
                    ...item.variantDetail,
                    price: convertedPrice,
                    salePrice: convertedSalePrice,
                    currency: exchangeRate.symbol,
                    currencyCode: currency
                }
            };
        });


        // Save the updated cart
        await cart.save();

        // Send the response with calculated prices and currency
        res.status(200).json({
            message: 'Cart Fetched successfully',
            cart: {
                ...cart.toObject(),
                totalPrice: totalPrice.toString(),
                deliveryCharge: deliveryChargeInCurrency.toString(),
                totalCartPrice: totalCartPriceInCurrency.toString(),
                currency: exchangeRate.symbol,
                currencyCode: exchangeRate.currency,
                country
            }
        });
    } catch (error) {
        console.log("Error while retrieving the cart", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete specific product and its variant from cart
router.delete('/remove', verifyToken, async (req, res) => {
    const { productID, variantID } = req.body;
    let { country, currency } = req.body;

    try {
        // Validate and set default values for country and currency
        if (country === "null" || country === "undefined" || country == null || country === undefined) {
            country = 'INDIA';
        }

        if (currency === "null" || currency === "undefined" || currency == null || currency === undefined) {
            currency = 'INR';
        }

        // Find the user's cart
        const cart = await CartModel.findOne({ userID: req.userDetail._id });
        if (!cart) return res.status(404).json({ message: 'Cart not found' });

        // Find and remove the item from the cart
        const itemIndex = cart.cartDetails.findIndex(item =>
            item.productID.toString() === productID && item.variantID.toString() === variantID
        );
        if (itemIndex === -1) return res.status(404).json({ message: 'Item not found in the cart' });

        cart.cartDetails.splice(itemIndex, 1);

        // Update cart details with the latest product and variant information
        cart.cartDetails = await Promise.all(cart.cartDetails.map(async item => {
            const product = await ProductModel.findById(item.productID);
            if (product) {
                const variant = product.variants.id(item.variantID);
                if (variant) {
                    return {
                        ...item.toObject(),
                        productDetail: product.toObject(),
                        variantDetail: variant.toObject()
                    };
                }
            }
            return null; // Filtering out any invalid items
        }));

        // Remove any null items from cartDetails
        cart.cartDetails = cart.cartDetails.filter(item => item !== null);

        // Calculate the total price of the cart in INR
        let totalPriceInINR = cart.cartDetails.reduce((total, item) => {
            let marginValue = item.variantDetail.margin / 100;
            let itemPrice;

            if (country === 'INDIA') {
                itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
            } else {
                if (['BANGLADESH', 'NEPAL'].includes(country)) {
                    itemPrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice + (item.variantDetail.salePrice * 0.20)) : (item.variantDetail.price + (item.variantDetail.price * 0.20));
                } else {
                    itemPrice = item.variantDetail.salePrice !== 0 ?
                        (item.variantDetail.salePrice + (item.variantDetail.salePrice * marginValue)) :
                        (item.variantDetail.price + (item.variantDetail.price * marginValue));
                }
            }

            return total + (itemPrice * item.quantity);
        }, 0);

        totalPriceInINR = totalPriceInINR <= 0 ? 0.1 : totalPriceInINR;

        // Determine delivery charge based on total price in INR
        let deliveryChargeInINR = 0;
        if (country === 'INDIA') {
            if (totalPriceInINR > 0 && totalPriceInINR < 500) {
                deliveryChargeInINR = 99;
            } else if (totalPriceInINR >= 500 && totalPriceInINR < 1000) {
                deliveryChargeInINR = 59;
            } else if (totalPriceInINR >= 1000) {
                deliveryChargeInINR = 0;
            }
        } else if (['BANGLADESH', 'NEPAL'].includes(country)) {
            deliveryChargeInINR = 3107;
        } else {
            if (totalPriceInINR > 0 && totalPriceInINR < 4177.78) {
                deliveryChargeInINR = 4178.62;
            } else if (totalPriceInINR >= 4177.78 && totalPriceInINR < 16713.64) {
                deliveryChargeInINR = 3342.90;
            } else if (totalPriceInINR >= 16713.65) {
                deliveryChargeInINR = 0;
            }
        }

        // Convert delivery charge to the selected currency
        let deliveryChargeInCurrency = deliveryChargeInINR;
        let symbol = '₹';

        if (currency !== 'INR') {
            const exchangeRate = await ExchangeRate.findOne({ currency: currency });
            if (!exchangeRate) return res.status(404).json({ message: 'Exchange rate not found for the selected currency' });

            deliveryChargeInCurrency = deliveryChargeInINR * exchangeRate.rate;
            symbol = exchangeRate.symbol;
        }

        // Calculate total cart price in selected currency
        const totalCartPrice = (parseFloat(totalPriceInINR) + parseFloat(deliveryChargeInINR)).toFixed(2);
        const totalCartPriceInCurrency = (totalCartPrice * (currency === 'INR' ? 1 : exchangeRate.rate)).toFixed(2);

        // Convert numbers to strings with two decimal places
        const totalPriceInCurrency = (parseFloat(totalPriceInINR) * (currency === 'INR' ? 1 : exchangeRate.rate)).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);

        // Save the updated cart
        await cart.save();

        // Send the response with the updated cart and calculated prices
        res.status(200).json({
            message: 'Item removed from cart successfully',
            cart: {
                ...cart.toObject(),
                totalPrice: totalPriceInCurrency.toString(),
                deliveryCharge: deliveryChargeInCurrency.toString(),
                totalCartPrice: totalCartPriceInCurrency.toString(),
                currency: symbol,
                country
            }
        });

    } catch (error) {
        console.log('Error while removing item from cart', error);
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

// // Add a single item from the wishlist to the cart
// router.post('/add-from-wishlist', verifyToken, async (req, res) => {
//     const userID = req.userDetail._id;
//     const { productID, variantID, country = 'INDIA', currency = 'INR' } = req.body;

//     try {
//         // Find the wishlist
//         const wishlist = await WishlistItem.findOne({ userID });

//         if (!wishlist) {
//             return res.status(404).json({ msg: 'Wishlist not found' });
//         }

//         // Find the wishlist item
//         const wishlistItem = wishlist.items.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);

//         if (!wishlistItem) {
//             return res.status(404).json({ msg: 'Item not found in wishlist' });
//         }

//         // Find the product and its variant
//         const product = await Product.findById(productID);
//         if (!product) {
//             return res.status(404).json({ msg: 'Product not found' });
//         }

//         const variant = product.variants.id(variantID);
//         if (!variant) {
//             return res.status(404).json({ msg: 'Variant not found' });
//         }

//         // Find or create the cart
//         let cart = await CartModel.findOne({ userID });
//         if (!cart) {
//             cart = new CartModel({ userID, cartDetails: [{ productID, variantID, quantity: 1 }] });
//         } else {
//             const itemExists = cart.cartDetails.some(item => item.productID.toString() === productID && item.variantID.toString() === variantID);
//             if (itemExists) {
//                 return res.status(400).json({ msg: 'Product variant already in cart' });
//             }
//             cart.cartDetails.push({ productID, variantID, quantity: 1 });
//         }

//         await cart.save();

//         // Calculate the total price of the cart
//         let totalPrice = cart.cartDetails.reduce((total, item) => {
//             let itemPrice;

//             if (country === 'INDIA') {
//                 itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
//             } else {
//                 itemPrice = item.variantDetail.salePrice !== 0 ?
//                     (item.variantDetail.salePrice + (item.variantDetail.salePrice * item.variantDetail.margin / 100)) :
//                     (item.variantDetail.price + (item.variantDetail.price * item.variantDetail.margin / 100));
//             }

//             return total + itemPrice * item.quantity;
//         }, 0);

//         // Determine delivery charge based on country
//         let deliveryCharge = 0;
//         if (country === 'INDIA') {
//             if (totalPrice > 0 && totalPrice < 500) {
//                 deliveryCharge = 99;
//             } else if (totalPrice >= 500 && totalPrice < 1000) {
//                 deliveryCharge = 59;
//             } else if (totalPrice >= 1000) {
//                 deliveryCharge = 0;
//             }
//         } else {
//             if (totalPrice > 0 && totalPrice < 4177.78) {
//                 deliveryCharge = 4178.62;
//             } else if (totalPrice >= 4177.78 && totalPrice < 16713.64) {
//                 deliveryCharge = 3342.90;
//             } else if (totalPrice >= 16713.65) {
//                 deliveryCharge = 0;
//             }
//         }

//         // Fetch exchange rate for the selected currency
//         let deliveryChargeInCurrency = deliveryCharge;
//         let symbol = '₹';
//         if (currency !== 'INR') {
//             const exchangeRate = await ExchangeRate.findOne({ currency: currency });
//             if (!exchangeRate) {
//                 return res.status(404).json({ msg: 'Exchange rate not found for the selected currency' });
//             }
//             // Convert delivery charge to the selected currency
//             deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);

//             // Convert total price to the selected currency
//             totalPrice = (totalPrice * exchangeRate.rate).toFixed(2);
//             totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

//             symbol = exchangeRate.currency === 'AED' ? exchangeRate.currency : exchangeRate.symbol;
//         } else {
//             // Calculate total cart price in INR
//             totalCartPrice = (totalPrice + deliveryCharge).toFixed(2);
//         }

//         // Convert numbers to strings with two decimal places
//         totalPrice = parseFloat(totalPrice).toFixed(2);
//         deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);
//         totalCartPrice = parseFloat(totalCartPrice).toFixed(2);

//         // Send the response with calculated prices and currency
//         res.status(200).json({
//             msg: 'Product variant added to cart from wishlist',
//             data: cart,
//             totalPrice: totalPrice.toString(),
//             deliveryCharge: deliveryChargeInCurrency.toString(),
//             totalCartPrice: totalCartPrice.toString(),
//             currency: symbol
//         });
//     } catch (error) {
//         console.error('Error adding product variant from wishlist to cart:', error);
//         res.status(500).json({ msg: 'Internal server error, try again later' });
//     }
// });

// // Add all products from the wishlist to the cart
// router.post('/add-one-wishlist', verifyToken, async (req, res) => {
//     const userID = req.userDetail._id;
//     const { productID, variantID, country = 'INDIA', currency = 'INR' } = req.body;

//     try {
//         // Find the wishlist
//         const wishlist = await WishlistItem.findOne({ userID });

//         if (!wishlist) {
//             return res.status(404).json({ msg: 'Wishlist not found' });
//         }

//         // Find the wishlist item
//         const wishlistItem = wishlist.items.find(item => item.productID.toString() === productID && item.variantID.toString() === variantID);

//         if (!wishlistItem) {
//             return res.status(404).json({ msg: 'Item not found in wishlist' });
//         }

//         // Find the product and its variant
//         const product = await ProductModel.findById(productID);
//         if (!product) {
//             return res.status(404).json({ msg: 'Product not found' });
//         }

//         const variant = product.variants.id(variantID);
//         if (!variant) {
//             return res.status(404).json({ msg: 'Variant not found' });
//         }

//         // Find or create the cart
//         let cart = await CartModel.findOne({ userID });
//         if (!cart) {
//             cart = new CartModel({ userID, cartDetails: [] });
//         }

//         // Check if item already exists in the cart
//         const itemExists = cart.cartDetails.some(item => item.productID.toString() === productID && item.variantID.toString() === variantID);
//         if (itemExists) {
//             return res.status(400).json({ msg: 'Product variant already in cart' });
//         }

//         // Add item to cart
//         cart.cartDetails.push({
//             productID,
//             variantID,
//             quantity: 1,  // Default quantity
//             productDetail: {
//                 title: product.title,
//                 slug: product.slug,
//                 images: product.images,
//                 generic: product.generic,
//                 treatment: product.treatment,
//                 isReturnable: product.isReturnable,
//                 isPrescriptionRequired: product.isPrescriptionRequired,
//                 isVisible: product.isVisible,
//                 shortDescription: product.shortDescription,
//                 description: product.description,
//                 sideEffects: product.sideEffects,
//                 faq: product.faq,
//                 additionalInformation: product.additionalInformation,
//                 moreInformation: product.moreInformation,
//                 purchaseNote: product.purchaseNote,
//                 categoryID: product.categoryID,
//                 tags: product.tags,
//                 upSell: product.upSell,
//                 crossSell: product.crossSell,
//                 externalLink: product.externalLink,
//                 position: product.position,
//                 manufacturerID: product.manufacturerID,
//                 originCountry: product.originCountry,
//                 isDiscontinued: product.isDiscontinued,
//                 metaTitle: product.metaTitle,
//                 metaDescription: product.metaDescription,
//                 metaTags: product.metaTags,
//             },
//             variantDetail: {
//                 sku: variant.sku,
//                 packSize: variant.packSize,
//                 isStockAvailable: variant.isStockAvailable,
//                 currency: variant.currency,
//                 price: variant.price,
//                 salePrice: variant.salePrice,
//                 margin: variant.margin,
//                 minOrderQuantity: variant.minOrderQuantity,
//                 maxOrderQuantity: variant.maxOrderQuantity,
//                 weight: variant.weight,
//                 weightUnit: variant.weightUnit,
//                 length: variant.length,
//                 lengthUnit: variant.lengthUnit,
//                 width: variant.width,
//                 widthUnit: variant.widthUnit,
//                 height: variant.height,
//                 heightUnit: variant.heightUnit,
//             }
//         });

//         // Calculate total price
//         let totalPrice = cart.cartDetails.reduce((total, item) => {
//             let itemPrice;

//             if (country === 'INDIA') {
//                 itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice : item.variantDetail.price;
//             } else {
//                 itemPrice = item.variantDetail.salePrice !== 0 ?
//                     (item.variantDetail.salePrice + (item.variantDetail.salePrice * item.variantDetail.margin / 100)) :
//                     (item.variantDetail.price + (item.variantDetail.price * item.variantDetail.margin / 100));
//             }

//             return total + itemPrice * item.quantity;
//         }, 0);

//         // Determine delivery charge
//         let deliveryCharge = 0;
//         if (country === 'INDIA') {
//             if (totalPrice > 0 && totalPrice < 500) {
//                 deliveryCharge = 99;
//             } else if (totalPrice >= 500 && totalPrice < 1000) {
//                 deliveryCharge = 59;
//             } else if (totalPrice >= 1000) {
//                 deliveryCharge = 0;
//             }
//         } else {
//             if (totalPrice > 0 && totalPrice < 4177.78) {
//                 deliveryCharge = 4178.62;
//             } else if (totalPrice >= 4177.78 && totalPrice < 16713.64) {
//                 deliveryCharge = 3342.90;
//             } else if (totalPrice >= 16713.65) {
//                 deliveryCharge = 0;
//             }
//         }

//         // Fetch exchange rate
//         let deliveryChargeInCurrency = deliveryCharge;
//         let symbol = '₹';
//         if (currency !== 'INR') {
//             const exchangeRate = await ExchangeRate.findOne({ currency: currency });
//             if (!exchangeRate) {
//                 return res.status(404).json({ msg: 'Exchange rate not found for the selected currency' });
//             }

//             // Convert delivery charge and total price
//             deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);
//             totalPrice = (totalPrice * exchangeRate.rate).toFixed(2);
//             totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

//             symbol = exchangeRate.currency === 'AED' ? exchangeRate.currency : exchangeRate.symbol;
//         } else {
//             totalCartPrice = (totalPrice + deliveryCharge).toFixed(2);
//         }

//         // Convert numbers to strings
//         totalPrice = parseFloat(totalPrice).toFixed(2);
//         deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);
//         totalCartPrice = parseFloat(totalCartPrice).toFixed(2);

//         // Save the updated cart
//         await cart.save();

//         // Send the response
//         res.status(200).json({
//             msg: 'Item added to cart successfully',
//             cart: {
//                 ...cart.toObject(),
//                 totalPrice: totalPrice.toString(),
//                 deliveryCharge: deliveryChargeInCurrency.toString(),
//                 totalCartPrice: totalCartPrice.toString(),
//                 currency: symbol
//             }
//         });

//     } catch (error) {
//         console.error('Error while adding item from wishlist to cart:', error);
//         res.status(500).json({ msg: 'Internal server error, try again later' });
//     }
// });

module.exports = router;