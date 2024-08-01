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
                throw new Error('Exchange rate not found for the selected currency');
            }
        }

        // Find the user's cart
        const cart = await CartModel.findOne({ userID: userID });
        if (!cart) {
            return { error: 'Cart not found' };
        }

        let requiresPrescription = false;
        const products = [];

        // Update cart details with the latest product and variant information
        for (let item of cart.cartDetails) {
            const product = await ProductModel.findById(item.productID);
            if (product) {
                // Check if the product requires a prescription
                if (product.productDetail && product.productDetail.isPrescriptionRequired) {
                    requiresPrescription = true;
                }

                const variant = product.variants.id(item.variantID);
                if (variant) {
                    // Update product and variant details
                    item.productDetail = { ...product.toObject() }; // Update product details
                    item.variantDetail = { ...variant.toObject() }; // Update variant details

                    // Calculate price based on the provided currency and country
                    let price = variant.price;
                    let salePrice = variant.salePrice || 0;

                    if (country !== "INDIA") {
                        const marginPercentage = variant.margin / 100;
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
                        price: price.toFixed(2),
                        salePrice: salePrice.toFixed(2),
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

        // Calculate the total price of the cart in INR
        let totalPriceInINR = cart.cartDetails.reduce((total, item) => {
            let marginValue = item.variantDetail.margin / 100;

            // Use base price (salePrice or price) for calculation
            let itemPrice = parseFloat(item.variantDetail.salePrice) || parseFloat(item.variantDetail.price);

            if (country !== "INDIA") {
                let priceWithMargin = itemPrice + (itemPrice * marginValue);

                itemPrice = priceWithMargin;
            }

            total += (parseFloat(itemPrice) * item.quantity);
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

        // Return the results
        return {
            requiresPrescription,
            products,
            totalCartPrice: totalCartPriceInCurrency.toString(),
            deliveryCharge: deliveryChargeInCurrency.toString(),
            totalPrice: totalPrice.toString()
        };

    } catch (error) {
        console.error('Error calculating cart price:', error);
        throw new Error('Error calculating cart price');
    }
};

module.exports = { calculateTotalCartPrice };