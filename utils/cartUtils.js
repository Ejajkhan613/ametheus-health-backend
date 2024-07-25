// utils/cartUtils.js
const ExchangeRate = require('../models/currencyPriceModel'); // Import the ExchangeRate model
const CartItem = require('../models/cartModel'); // Import the Cart model

// Calculate total cart price based on userID, country, and currency
const calculateTotalCartPrice = async (userID, country, currency) => {
    try {
        // Fetch cart details based on userID
        const cart = await CartItem.findOne({ userID })
            .populate('cartDetails.productID')
            .populate('cartDetails.variantID')
            .exec();

        if (!cart) {
            throw new Error('Cart not found');
        }

        let totalCartPrice = 0;
        let deliveryCharge = 0;
        let totalPrice = 0;
        let requiresPrescription = false;
        const products = [];

        // Fetch exchange rate for the selected currency if it's not INR
        let exchangeRate = { rate: 1, symbol: '₹' }; // Default for INR
        if (currency !== 'INR') {
            exchangeRate = await ExchangeRate.findOne({ currency }).exec();
            if (!exchangeRate) {
                throw new Error('Exchange rate not found for the selected currency');
            }
        }

        // Calculate total price and delivery charge based on country and currency
        for (const item of cart.cartDetails) {
            const { variantDetail, quantity, productID } = item;
            let itemPrice = variantDetail.salePrice || variantDetail.price;

            // Ensure productID and its properties are defined
            if (productID && productID.requiresPrescription) {
                requiresPrescription = true;
            }

            if (country !== 'India') {
                const marginPercentage = variantDetail.margin || 0;
                itemPrice += (itemPrice * marginPercentage / 100);
            }

            if (currency !== 'INR') {
                itemPrice = (itemPrice * exchangeRate.rate);
            }

            totalCartPrice += itemPrice * quantity;
            products.push({
                productID: productID._id,
                variantID: variantDetail._id,
                quantity,
                price: itemPrice
            });
        }

        // Determine delivery charge based on country
        if (country === 'India') {
            if (totalCartPrice > 0 && totalCartPrice < 500) {
                deliveryCharge = 99;
            } else if (totalCartPrice >= 500 && totalCartPrice < 1000) {
                deliveryCharge = 59;
            } else if (totalCartPrice >= 1000) {
                deliveryCharge = 0;
            }
        } else {
            if (totalCartPrice > 0 && totalCartPrice < 4177.78) {
                deliveryCharge = 4178.62;
            } else if (totalCartPrice >= 4177.78 && totalCartPrice < 16713.64) {
                deliveryCharge = 3342.90;
            } else if (totalCartPrice >= 16713.65) {
                deliveryCharge = 0;
            }
        }

        // Convert delivery charge to the selected currency
        let deliveryChargeInCurrency = deliveryCharge;
        if (currency !== 'INR') {
            deliveryChargeInCurrency = deliveryCharge * exchangeRate.rate;
        }

        // Calculate total cart price
        totalPrice = (totalCartPrice + deliveryChargeInCurrency).toFixed(2);

        // Return the results
        return {
            requiresPrescription,
            products,
            totalCartPrice: totalCartPrice.toFixed(2),
            deliveryCharge: deliveryChargeInCurrency.toFixed(2),
            totalPrice
        };
    } catch (error) {
        console.error(error);
        throw new Error('Error calculating cart price');
    }
};

module.exports = { calculateTotalCartPrice };