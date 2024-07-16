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

// GET all generics
genericRoute.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filters = {};

        if (req.query.name) filters.name = new RegExp(req.query.name, 'i');

        const sortOptions = {};
        const { sortBy = 'name', order = 'asc' } = req.query;
        if (sortBy && order) {
            sortOptions[sortBy] = order === 'asc' ? 1 : -1;
        }

        const totalCount = await GenericModel.countDocuments(filters);
        const totalPages = Math.ceil(totalCount / limit);

        const Generics = await GenericModel.find(filters)
            .skip(skip)
            .limit(limit)
            .sort(sortOptions)
            .collation({ locale: 'en', strength: 2 })
            .lean();

        res.status(200).send({
            msg: 'Success',
            data: Generics,
            page,
            limit,
            totalPages,
            totalCount
        });
    } catch (error) {
        console.error('Error fetching generics:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// GET a generic by ID (with all products who have the same genericID)
genericRoute.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const generic = await GenericModel.findById(id).lean();
        if (!generic) {
            return res.status(404).json({ msg: 'Generic not found' });
        }

        const products = await ProductModel.find({ genericID: id }).lean();

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        const country = req.query.country || 'INDIA';
        const currency = req.query.currency || 'INR';

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
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
                    if (exchangeRate.rate !== 1) { // Currency other than INR
                        variant.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                        variant.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                    } else {
                        variant.price = Number(indianMRP.toFixed(2));
                        variant.salePrice = Number(indianSaleMRP.toFixed(2));
                    }
                } else { // OUTSIDE INDIA
                    const priceWithMargin = indianMRP * (1 + margin);
                    const salePriceWithMargin = indianSaleMRP * (1 + margin);

                    variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
                }
                variant.currency = currencySymbol; // Set the currency symbol
            });
        });

        generic.products = products;

        return res.status(200).json({ msg: 'Success', data: generic });
    } catch (error) {
        console.error('Error fetching generic:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
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
