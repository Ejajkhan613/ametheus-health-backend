const ExchangeRate = require('../models/currencyPriceModel'); // Import the ExchangeRate model
const CartModel = require('../models/cartModel'); // Import the Cart model
const ProductModel = require('../models/productModel'); // Import the Product model

// Calculate total cart price based on userID, country, and currency
const calculateTotalCartPrice = async (userID, country, currency) => {
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
        const cart = await CartModel.findOne({ userID: userID });

        // Check if the cart is found
        if (!cart) {
            return { error: 'Cart not found' };
        }

        let requiresPrescription = false;
        const products = [];

        // Update cart details with the latest product and variant information
        for (let item of cart.cartDetails) {
            const product = await ProductModel.findById(item.productID);
            if (product) {
                // Check if the product requires prescription
                if (product.productDetail && product.productDetail.isPrescriptionRequired) {
                    requiresPrescription = true;
                }

                const variant = product.variants.id(item.variantID);
                if (variant) {
                    // Update product and variant details
                    item.productDetail = { ...product.toObject() }; // Update product details
                    item.variantDetail = { ...variant.toObject() }; // Update variant details

                    // Calculate price based on the provided currency and country
                    let price = item.variantDetail.price;
                    let salePrice = item.variantDetail.salePrice || 0;

                    if (country !== "INDIA") {
                        const marginPercentage = item.variantDetail.margin / 100;
                        price = price + (price * marginPercentage);
                        salePrice = salePrice + (salePrice * marginPercentage);
                    }

                    if (currency !== "INR") {
                        price = price * exchangeRate.rate;
                        salePrice = salePrice * exchangeRate.rate;
                    }

                    products.push({
                        productID: product._id,
                        title: product.title,
                        images: product.images,
                        variantID: variant._id,
                        packSize: variant.packSize,
                        margin: variant.margin,
                        quantity: item.quantity,
                        price: (price).toFixed(2),
                        salePrice: (salePrice).toFixed(2),
                        currency: exchangeRate.symbol
                    });
                } else {
                    // If the variant is not found, remove the item from the cart
                    cart.cartDetails = cart.cartDetails.filter(cartItem => cartItem._id.toString() !== item._id.toString());
                }
            } else {
                // If the product is not found, remove the item from the cart
                cart.cartDetails = cart.cartDetails.filter(cartItem => cartItem._id.toString() !== item._id.toString());
            }
        }

        // Calculate the total price of the cart
        let totalPrice = products.reduce((total, item) => {
            console.log("ITEM-DETAILS", item)
            let itemPrice;
            if (currency !== "INR") {
                itemPrice = +(item.salePrice) || +(item.price);
                itemPrice = itemPrice * exchangeRate.rate;
            } else {
                itemPrice = +(item.salePrice) || +(item.price);
            }

            itemPrice = +itemPrice;
            console.log("ITEM-DETAILS", itemPrice)
            return total + (parseFloat(itemPrice) * item.quantity);
        }, 0).toFixed(2);

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

        // Convert delivery charge to the selected currency
        let deliveryChargeInCurrency = deliveryCharge;
        if (currency !== 'INR') {
            deliveryChargeInCurrency = deliveryCharge * exchangeRate.rate;
        }

        // Calculate total cart price
        const totalCartPrice = (parseFloat(totalPrice) + parseFloat(deliveryChargeInCurrency)).toFixed(2);

        // Convert numbers to strings with two decimal places
        totalPrice = parseFloat(totalPrice).toFixed(2);
        deliveryChargeInCurrency = parseFloat(deliveryChargeInCurrency).toFixed(2);

        // Return the results
        return {
            requiresPrescription,
            products,
            totalCartPrice: totalCartPrice.toString(),
            deliveryCharge: deliveryChargeInCurrency.toString(),
            totalPrice: totalPrice.toString()
        };

    } catch (error) {
        console.error('Error calculating cart price:', error);
        throw new Error('Error calculating cart price');
    }
};

module.exports = { calculateTotalCartPrice };