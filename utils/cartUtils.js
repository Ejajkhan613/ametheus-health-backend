const ExchangeRate = require('../models/currencyPriceModel'); // Import the ExchangeRate model
const CartModel = require('../models/cartModel'); // Import the Cart model
const ProductModel = require('../models/productModel'); // Import the Product model

// Calculate total cart price based on userID, country, and currency
const calculateTotalCartPrice = async (userID, country = "INDIA", currency = "INR") => {
    try {
        // Find the user's cart
        const cart = await CartModel.findOne({ userID: userID });

        // Check if the cart is found
        if (!cart) {
            return { error: 'Cart not found' };
        }

        let requiresPrescription = false;
        const products = [];

        // Fetch exchange rate for the selected currency if it's not INR
        let exchangeRate = { rate: 1, symbol: '₹', currency: 'INR' }; // Default for INR
        if (currency !== 'INR') {
            exchangeRate = await ExchangeRate.findOne({ currency: currency });
            if (!exchangeRate) {
                return { error: 'Exchange rate not found for the selected currency' };
            }
        }

        // Update cart details with the latest product and variant information
        for (let item of cart.cartDetails) {
            const product = await ProductModel.findById(item.productID);
            if (product) {
                // Check if the product requires prescription
                if (product.productDetail && product.productDetail.requiresPrescription) {
                    requiresPrescription = true;
                }

                const variant = product.variants.id(item.variantID);
                if (variant) {
                    // Update product and variant details
                    item.productDetail = { ...product.toObject() }; // Update product details
                    item.variantDetail = { ...variant.toObject() }; // Update variant details
                } else {
                    // If the variant is not found, remove the item from the cart
                    cart.cartDetails = cart.cartDetails.filter(cartItem => cartItem._id.toString() !== item._id.toString());
                }

                // Calculate the price and salePrice based on the provided currency and country
                let convertedPrice = item.variantDetail.price;
                let convertedSalePrice = item.variantDetail.salePrice;
                if (country === "INDIA") {
                    if (currency !== "INR") {
                        convertedPrice = (item.variantDetail.price * exchangeRate.rate).toFixed(2);
                        convertedSalePrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice * exchangeRate.rate).toFixed(2) : '0.00';
                    }
                } else {
                    // NON-INDIA
                    const marginPercentage = item.variantDetail.margin / 100;
                    if (item.variantDetail.salePrice !== 0) {
                        convertedPrice = ((item.variantDetail.price + (item.variantDetail.price * marginPercentage)) * exchangeRate.rate).toFixed(2);
                        convertedSalePrice = ((item.variantDetail.salePrice + (item.variantDetail.salePrice * marginPercentage)) * exchangeRate.rate).toFixed(2);
                    } else {
                        convertedPrice = ((item.variantDetail.price + (item.variantDetail.price * marginPercentage)) * exchangeRate.rate).toFixed(2);
                        convertedSalePrice = '0.00';
                    }
                }

                products.push({
                    productID: product._id,
                    title: product.title,
                    variantID: variant._id,
                    packSize: variant.packSize,
                    margin: variant.margin,
                    quantity: item.quantity,
                    price: convertedPrice,
                    salePrice: convertedSalePrice,
                    currency: exchangeRate.symbol
                });
            } else {
                // If the product is not found, remove the item from the cart
                cart.cartDetails = cart.cartDetails.filter(cartItem => cartItem._id.toString() !== item._id.toString());
            }
        }

        // Calculate the total price of the cart
        let totalPrice = cart.cartDetails.reduce((total, item) => {
            let itemPrice;
            if (country === "INDIA") {
                if (currency !== "INR") {
                    itemPrice = item.variantDetail.salePrice !== 0 ? (item.variantDetail.salePrice * exchangeRate.rate).toFixed(2) : (item.variantDetail.price * exchangeRate.rate).toFixed(2);
                } else {
                    itemPrice = item.variantDetail.salePrice !== 0 ? item.variantDetail.salePrice.toFixed(2) : item.variantDetail.price.toFixed(2);
                }
            } else {
                // NON-INDIA
                const marginPercentage = item.variantDetail.margin / 100;
                if (currency !== "INR") {
                    itemPrice = item.variantDetail.salePrice !== 0 ? ((item.variantDetail.salePrice + (item.variantDetail.salePrice * marginPercentage)) * exchangeRate.rate).toFixed(2) : ((item.variantDetail.price + (item.variantDetail.price * marginPercentage)) * exchangeRate.rate).toFixed(2);
                } else {
                    itemPrice = item.variantDetail.salePrice !== 0 ? ((item.variantDetail.salePrice + (item.variantDetail.salePrice * marginPercentage))).toFixed(2) : ((item.variantDetail.price + (item.variantDetail.price * marginPercentage))).toFixed(2);
                }
            }

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
            deliveryChargeInCurrency = (deliveryCharge * exchangeRate.rate).toFixed(2);
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




// // utils/cartUtils.js
// const ExchangeRate = require('../models/currencyPriceModel'); // Import the ExchangeRate model
// const CartItem = require('../models/cartModel'); // Import the Cart model

// // Calculate total cart price based on userID, country, and currency
// const calculateTotalCartPrice = async (userID, country, currency) => {
//     try {
//         // Fetch cart details based on userID
//         const cart = await CartItem.findOne({ userID })
//             .populate('cartDetails.productID')
//             .populate('cartDetails.variantID')
//             .exec();

//         if (!cart) {
//             throw new Error('Cart not found');
//         }

//         let totalCartPrice = 0;
//         let deliveryCharge = 0;
//         let totalPrice = 0;
//         let requiresPrescription = false;
//         const products = [];

//         // Fetch exchange rate for the selected currency if it's not INR
//         let exchangeRate = { rate: 1, symbol: '₹' }; // Default for INR
//         if (currency !== 'INR') {
//             exchangeRate = await ExchangeRate.findOne({ currency }).exec();
//             if (!exchangeRate) {
//                 throw new Error('Exchange rate not found for the selected currency');
//             }
//         }

//         // Calculate total price and delivery charge based on country and currency
//         for (const item of cart.cartDetails) {
//             const { variantDetail, quantity, productID } = item;
//             let itemPrice = variantDetail.salePrice || variantDetail.price;

//             // Ensure productID and its properties are defined
//             if (productID && productID.requiresPrescription) {
//                 requiresPrescription = true;
//             }

//             if (country !== 'India') {
//                 const marginPercentage = variantDetail.margin || 0;
//                 itemPrice += (itemPrice * marginPercentage / 100);
//             }

//             if (currency !== 'INR') {
//                 itemPrice = (itemPrice * exchangeRate.rate);
//             }

//             totalCartPrice += itemPrice * quantity;
//             products.push({
//                 productID: productID._id,
//                 variantID: variantDetail._id,
//                 quantity,
//                 price: itemPrice
//             });
//         }

//         // Determine delivery charge based on country
//         if (country === 'India') {
//             if (totalCartPrice > 0 && totalCartPrice < 500) {
//                 deliveryCharge = 99;
//             } else if (totalCartPrice >= 500 && totalCartPrice < 1000) {
//                 deliveryCharge = 59;
//             } else if (totalCartPrice >= 1000) {
//                 deliveryCharge = 0;
//             }
//         } else {
//             if (totalCartPrice > 0 && totalCartPrice < 4177.78) {
//                 deliveryCharge = 4178.62;
//             } else if (totalCartPrice >= 4177.78 && totalCartPrice < 16713.64) {
//                 deliveryCharge = 3342.90;
//             } else if (totalCartPrice >= 16713.65) {
//                 deliveryCharge = 0;
//             }
//         }

//         // Convert delivery charge to the selected currency
//         let deliveryChargeInCurrency = deliveryCharge;
//         if (currency !== 'INR') {
//             deliveryChargeInCurrency = deliveryCharge * exchangeRate.rate;
//         }

//         // Calculate total cart price
//         totalPrice = (totalCartPrice + deliveryChargeInCurrency).toFixed(2);

//         // Return the results
//         return {
//             requiresPrescription,
//             products,
//             totalCartPrice: totalCartPrice.toFixed(2),
//             deliveryCharge: deliveryChargeInCurrency.toFixed(2),
//             totalPrice
//         };
//     } catch (error) {
//         console.error(error);
//         throw new Error('Error calculating cart price');
//     }
// };

// module.exports = { calculateTotalCartPrice };