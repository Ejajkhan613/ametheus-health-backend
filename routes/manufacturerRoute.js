const express = require('express');
const mongoose = require('mongoose');
const slugify = require('slugify');
const { body, validationResult } = require('express-validator');

const verifyToken = require('../middlewares/auth');

const ManufacturerModel = require('../models/manufacturerModel');
const ProductModel = require('../models/productModel');
const ExchangeRate = require('../models/currencyPriceModel');

const manufacturerRouter = express.Router();

async function createSlug(text) {
    let slug = slugify(text, { lower: true, strict: true });
    let uniqueSlug = slug;
    let count = 0;

    while (await ManufacturerModel.findOne({ slug: uniqueSlug })) {
        count++;
        uniqueSlug = `${slug}-${count}`;
    }

    return uniqueSlug;
}

// Validation middleware for manufacturer operations
const validateManufacturer = [
    body('name').notEmpty().withMessage('Manufacturer Name is required'),
    body('address').optional().isString()
];

// Create a new manufacturer
manufacturerRouter.post('/', validateManufacturer, verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, address = "" } = req.body;
        const slug = await createSlug(name);
        const newManufacturer = new ManufacturerModel({ name, slug, address });
        await newManufacturer.save();

        const data = newManufacturer.toObject();
        delete data.__v;

        res.status(201).json({ msg: 'Manufacturer created successfully', data });
    } catch (error) {
        console.error('Error creating manufacturer:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Update a manufacturer
manufacturerRouter.patch('/:id', validateManufacturer, verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const { name, address } = req.body;
        const updatedManufacturer = await ManufacturerModel.findByIdAndUpdate(id, { name, address }, { new: true });
        if (!updatedManufacturer) {
            return res.status(404).json({ msg: 'Manufacturer not found' });
        }

        const data = updatedManufacturer.toObject();
        delete data.__v;

        res.status(200).json({ msg: 'Manufacturer updated successfully', data });
    } catch (error) {
        console.error('Error updating manufacturer:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Get all manufacturers with search and pagination
manufacturerRouter.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;

        // Convert `page` and `limit` to integers
        const pageNumber = parseInt(page, 10);
        const limitNumber = parseInt(limit, 10);

        // Set default values for pagination
        const skip = (pageNumber - 1) * limitNumber;

        // Determine if search term is a valid ObjectId
        const isValidObjectId = mongoose.Types.ObjectId.isValid(search);
        let searchQuery = {};

        if (search) {
            if (isValidObjectId) {
                searchQuery = { _id: search };
            } else {
                searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: 'i' } }, // Case-insensitive search
                        { slug: { $regex: search, $options: 'i' } },
                        { address: { $regex: search, $options: 'i' } }
                    ]
                };
            }
        }

        // Fetch manufacturers with search and pagination
        const manufacturers = await ManufacturerModel.find(searchQuery)
            .skip(skip)
            .limit(limitNumber)
            .select('-__v');

        // Count total number of documents matching the search query
        const totalManufacturers = await ManufacturerModel.countDocuments(searchQuery);

        res.status(200).json({
            msg: 'Success',
            data: manufacturers,
            page: pageNumber,
            limit: limitNumber,
            totalPages: Math.ceil(totalManufacturers / limitNumber),
            totalCount: totalManufacturers
        });
    } catch (error) {
        console.error('Error fetching manufacturers:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Get all manufacturers with search and pagination
manufacturerRouter.get('/names', async (req, res) => {
    try {
        const { search = '' } = req.query;

        // Determine if search term is a valid ObjectId
        const isValidObjectId = mongoose.Types.ObjectId.isValid(search);
        let searchQuery = {};

        if (search) {
            if (isValidObjectId) {
                searchQuery = { _id: search };
            } else {
                searchQuery = {
                    $or: [
                        { name: { $regex: search, $options: 'i' } }, // Case-insensitive search
                        { slug: { $regex: search, $options: 'i' } },
                        { address: { $regex: search, $options: 'i' } }
                    ]
                };
            }
        }

        // Fetch manufacturers with search and pagination
        const manufacturers = await ManufacturerModel.find(searchQuery).select('name').sort({ name: 1 });

        res.status(200).json({
            msg: 'Success',
            data: manufacturers
        });
    } catch (error) {
        console.error('Error fetching manufacturers:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Get a manufacturer by ID (currency and country added)
manufacturerRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { currency = 'INR', country = 'INDIA' } = req.query;

        // Fetch the manufacturer
        const manufacturer = await ManufacturerModel.findById(id).select('-__v').lean();
        if (!manufacturer) {
            return res.status(404).json({ msg: 'Manufacturer not found' });
        }

        // Fetch products associated with the manufacturer
        const products = await ProductModel.find({ manufacturerID: id, isVisible: true }).lean();

        // Fetch exchange rate based on user's selected currency
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

        // Adjust product prices based on exchange rate and country
        products.forEach(product => {
            product.variants.forEach(variant => {
                let price = variant.price || 0;
                let salePrice = variant.salePrice || 0;
                const marginPercentage = variant.margin / 100 || 0.01;

                // Apply country-specific margin
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

                // Convert prices to the selected currency
                price = Number((price * exchangeRate.rate).toFixed(2));
                salePrice = Number((salePrice * exchangeRate.rate).toFixed(2));

                variant.price = price;
                variant.salePrice = salePrice;
                variant.currencyCode = currency;
                variant.currency = currencySymbol;
            });
        });

        manufacturer.products = products;

        res.status(200).json({ msg: 'Success', data: manufacturer });
    } catch (error) {
        console.error('Error fetching manufacturer:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Get a manufacturer by ID
manufacturerRouter.get('/admin/:id', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;

        // Fetch the manufacturer
        const manufacturer = await ManufacturerModel.findById(id).select('-__v').lean();
        if (!manufacturer) {
            return res.status(404).json({ msg: 'Manufacturer not found' });
        }

        // Fetch products associated with the manufacturer
        const products = await ProductModel.find({ manufacturerID: id }).lean();

        manufacturer.products = products;

        res.status(200).json({ msg: 'Success', data: manufacturer });
    } catch (error) {
        console.error('Error fetching manufacturer:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Remove or update a manufacturerID of a specific product
manufacturerRouter.post('/rmid', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const { products, manufacturerID } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ msg: 'Product IDs are required' });
    }

    try {
        // Determine the update operation based on the presence of manufacturerID
        const updateData = manufacturerID ? { manufacturerID } : { manufacturerID: "" };
        console.log(updateData);

        // Update the manufacturerID for the provided product IDs
        const result = await ProductModel.updateMany(
            { _id: { $in: products } },
            { $set: updateData }
        );

        res.status(200).json({ msg: 'Products updated successfully', modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error('Error updating manufacturerID:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Delete a manufacturer
manufacturerRouter.delete('/:id', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;

        // Update all products with the manufacturerID to an empty string
        await ProductModel.updateMany({ manufacturerID: id }, { $set: { manufacturerID: '' } });

        // Delete the manufacturer
        const deletedManufacturer = await ManufacturerModel.findByIdAndDelete(id);
        if (!deletedManufacturer) {
            return res.status(404).json({ msg: 'Manufacturer not found' });
        }

        res.status(200).json({ msg: 'Manufacturer deleted successfully' });
    } catch (error) {
        console.error('Error deleting manufacturer:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

module.exports = manufacturerRouter;