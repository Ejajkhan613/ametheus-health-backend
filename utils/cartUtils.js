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

        // Calculate total price and delivery charge based on country and currency
        for (const item of cart.cartDetails) {
            const { variantDetail, quantity } = item;
            let itemPrice = variantDetail.salePrice || variantDetail.price;

            if (country !== 'India') {
                const margin = variantDetail.margin || 0;
                itemPrice += (itemPrice * margin / 100);
            }

            totalCartPrice += itemPrice * quantity;
        }

        // Fetch delivery charge if applicable
        deliveryCharge = await getDeliveryCharge(country);

        // Convert totalCartPrice to selected currency if needed
        if (currency !== 'INR') {
            const exchangeRate = await ExchangeRate.findOne({ currency }).exec();
            if (!exchangeRate) {
                throw new Error('Exchange rate not found');
            }
            totalPrice = (totalCartPrice + deliveryCharge) * exchangeRate.rate;
        } else {
            totalPrice = totalCartPrice + deliveryCharge;
        }

        return { totalCartPrice, deliveryCharge, totalPrice };
    } catch (error) {
        console.error(error);
        throw new Error('Error calculating cart price');
    }
};

module.exports = { calculateTotalCartPrice };
