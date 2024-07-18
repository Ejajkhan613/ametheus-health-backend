// routes/orderRoute.js
const express = require('express');
const mongoose = require('mongoose');
const OrderItem = require('../models/orderModel');
const ProductModel = require('../models/productModel');
const ExchangeRate = require('../models/ExchangeRate');
const router = express.Router();

// Utility function to convert delivery charges based on currency
const convertDeliveryCharge = (chargeInINR, exchangeRate) => {
    return Number((chargeInINR * exchangeRate.rate).toFixed(2));
};

// Route to create an order
router.post('/', async (req, res) => {
    try {
        const { userID, name, companyName, country, streetAddress, city, state, pincode, mobile, email, age, passportURL, bloodPressure, weight, weightUnit, prescriptionURL, orderNotes, products, currency } = req.body;

        // Fetch exchange rate based on user's currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        if (currency && currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).json({ msg: 'Currency not supported' });
            }
        }

        // Calculate total cart price and prepare product details
        let totalCartPrice = 0;
        const productDetails = [];
        for (const item of products) {
            const product = await ProductModel.findById(item.productID).lean();
            if (!product) {
                return res.status(404).json({ msg: 'Product not found' });
            }
            const variant = product.variants.id(item.variantID);
            if (!variant) {
                return res.status(404).json({ msg: 'Variant not found' });
            }
            const price = variant.salePrice || variant.price;
            const priceInSelectedCurrency = Number((price * exchangeRate.rate).toFixed(2));

            totalCartPrice += priceInSelectedCurrency * item.quantity;

            productDetails.push({
                productID: item.productID,
                variantID: item.variantID,
                name: product.name,
                variantName: variant.name,
                quantity: item.quantity,
                price: price,
                salePrice: variant.salePrice || variant.price,
                currency: currencySymbol,
                margin: variant.margin
            });
        }

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
        if (exchangeRate.rate !== 1) {
            deliveryCharge = convertDeliveryCharge(deliveryCharge, exchangeRate);
        }

        // Create the order
        const order = new OrderItem({
            userID,
            name,
            companyName,
            country,
            streetAddress,
            city,
            state,
            pincode,
            mobile,
            email,
            age,
            passportURL,
            bloodPressure,
            weight,
            weightUnit,
            prescriptionURL,
            orderNotes,
            products: productDetails,
            currency: currencySymbol,
            totalCartPrice,
            deliveryCharge,
            totalPrice: totalCartPrice + deliveryCharge
        });

        await order.save();
        res.status(201).json({ msg: 'Order created successfully', data: order });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

module.exports = router;