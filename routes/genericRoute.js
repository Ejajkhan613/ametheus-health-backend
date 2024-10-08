const express = require('express');
const slugify = require('slugify');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const GenericModel = require('../models/genericModel');
const ProductModel = require('../models/productModel');
const verifyToken = require('../middlewares/auth');
const ExchangeRate = require('../models/currencyPriceModel');


async function createSlug(text) {
    let slug = slugify(text, { lower: true, strict: true });
    let uniqueSlug = slug;
    let count = 0;

    while (await GenericModel.findOne({ slug: uniqueSlug })) {
        count++;
        uniqueSlug = `${slug}-${count}`;
    }

    return uniqueSlug;
}


const genericRoute = express.Router();

// Validation middleware
const validateGeneric = [
    body('name').notEmpty().withMessage('Name is required'),
    body('uses').optional().isString(),
    body('works').optional().isString(),
    body('sideEffects').optional().isString(),
    body('expertAdvice').optional().isString(),
    body('faq').optional().isString()
];


// GET all generics with search, pagination, and sorting
genericRoute.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Determine if search term is a valid ObjectId
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.query.search || '');
        let filters = {};

        if (isValidObjectId) {
            filters._id = req.query.search;
        } else {
            if (req.query.search) {
                const searchTerm = req.query.search.trim();
                const regex = new RegExp(searchTerm, 'i');

                filters.$or = [
                    { name: regex },
                    { slug: regex }
                ];
            }
        }

        const sortOptions = {};
        const { sortBy = 'name', order = 'asc' } = req.query;
        if (sortBy && order) {
            sortOptions[sortBy] = order === 'asc' ? 1 : -1;
        }

        const totalCount = await GenericModel.countDocuments(filters);
        const totalPages = Math.ceil(totalCount / limit);

        const generics = await GenericModel.find(filters)
            .skip(skip)
            .limit(limit)
            .sort(sortOptions)
            .collation({ locale: 'en', strength: 2 })
            .lean();

        res.status(200).send({
            msg: 'Success',
            data: generics,
            page,
            limit,
            totalPages,
            totalCount
        });
    } catch (error) {
        console.error('Error fetching generics:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// GET all generics with optional search by name or ID
genericRoute.get('/names', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { search } = req.query;

        // Build query object for searching by name or ID
        let searchQuery = {};

        // Check if the search value is a valid MongoDB ObjectId
        if (search && mongoose.Types.ObjectId.isValid(search)) {
            searchQuery = { _id: mongoose.Types.ObjectId(search) };
        } else if (search) {
            searchQuery = { name: { $regex: search, $options: 'i' } };
            searchQuery = { slug: { $regex: search, $options: 'i' } };
        }

        // Fetch generics, filtered by search if provided
        const generics = await GenericModel.find(searchQuery).sort('name').select('name');

        res.status(200).send(generics);
    } catch (error) {
        console.error('Error fetching generics:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Route to update or clear genericID for a list of products
genericRoute.post('/rmid', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const { products, genericID } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ msg: 'Product IDs are required' });
    }

    try {
        // Determine the update operation based on the presence of genericID
        const updateData = genericID ? { genericID } : { genericID: "" };

        // Update the genericID for the provided product IDs
        const result = await ProductModel.updateMany(
            { _id: { $in: products } },
            { $set: updateData }
        );

        res.status(200).json({ msg: 'Products updated successfully', count: result.modifiedCount });
    } catch (error) {
        console.error('Error updating genericID:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// GET a generic by ID (with all products who have the same genericID)
genericRoute.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { country = 'INDIA', currency = 'INR', page = 1, limit = 10 } = req.query;

        // Convert pagination parameters to integers
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const skip = (pageNumber - 1) * pageSize;

        // Fetch the generic by ID
        const generic = await GenericModel.findById(id).lean();
        if (!generic) {
            return res.status(404).json({ msg: 'Generic not found' });
        }

        // Fetch products associated with the genericID with pagination
        const filters = { genericID: id, isVisible: true };
        const totalProducts = await ProductModel.countDocuments(filters);
        const totalPages = Math.ceil(totalProducts / pageSize);

        let products = await ProductModel.find(filters)
            .skip(skip)
            .limit(pageSize)
            .lean();

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

        // Adjust product prices based on exchange rate and country selection
        products.forEach(product => {
            product.variants.forEach(variant => {
                const indianMRP = variant.price || 0;
                const indianSaleMRP = variant.salePrice || 0;
                const margin = variant.margin / 100 || 0.01;

                if (country === 'INDIA') {
                    // If currency is INR, no need for additional conversion
                    variant.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                } else { // For other countries
                    const priceWithMargin = indianMRP * (1 + margin);
                    const salePriceWithMargin = indianSaleMRP * (1 + margin);

                    // Convert prices to the selected currency
                    variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
                }

                // Set the currency symbol
                variant.currency = currencySymbol;
            });
        });

        // Attach products to the generic object
        generic.products = products;

        res.status(200).json({
            msg: 'Success',
            data: generic,
            totalProducts,
            totalPages,
            currentPage: pageNumber,
            pageSize: pageSize
        });
    } catch (error) {
        console.error('Error fetching generic:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// GET a generic by ID (with all products who have the same genericID)
genericRoute.get('/admin/:id', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;

        // Convert pagination parameters to integers
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const skip = (pageNumber - 1) * pageSize;

        // Fetch the generic by ID
        const generic = await GenericModel.findById(id).lean();
        if (!generic) {
            return res.status(404).json({ msg: 'Generic not found' });
        }

        // Fetch products associated with the genericID with pagination
        const filters = { genericID: id };
        const totalProducts = await ProductModel.countDocuments(filters);
        const totalPages = Math.ceil(totalProducts / pageSize);

        const products = await ProductModel.find(filters)
            .skip(skip)
            .limit(pageSize)
            .lean();

        generic.products = products;


        res.status(200).json({
            msg: 'Success',
            data: generic,
            totalProducts,
            totalPages,
            currentPage: pageNumber,
            pageSize: pageSize
        });
    } catch (error) {
        console.error('Error fetching generic:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// POST a new generic
genericRoute.post('/', validateGeneric, verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, uses = "", works = "", sideEffects = "", expertAdvice = "", faq = "" } = req.body;
        const slug = await createSlug(name);
        const generic = new GenericModel({ name, slug, uses, works, sideEffects, expertAdvice, faq });
        await generic.save();
        return res.status(201).json({ msg: 'Generic created successfully', data: generic });
    } catch (error) {
        console.error('Error creating generic:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// PATCH a generic by ID
genericRoute.patch('/:id', validateGeneric, verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;

        const oldGenericData = await GenericModel.findById(id);

        const updates = req.body;

        if (updates.name && oldGenericData.name !== updates.name) {
            updates.slug = await createSlug(updates.name);
        } else {
            delete updates.slug;
        }

        delete updates._id;
        delete updates.__V;

        const generic = await GenericModel.findByIdAndUpdate(id, updates, { new: true });
        if (!generic) {
            return res.status(404).json({ msg: 'Generic not found' });
        }

        return res.status(200).json({ msg: 'Generic updated successfully', data: generic });
    } catch (error) {
        console.error('Error updating generic:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// DELETE a generic by ID
genericRoute.delete('/:id', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;
        const generic = await GenericModel.findByIdAndDelete(id);
        if (!generic) {
            return res.status(404).json({ msg: 'Generic not found' });
        }

        return res.status(200).json({ msg: 'Generic deleted successfully' });
    } catch (error) {
        console.error('Error deleting generic:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

module.exports = genericRoute;