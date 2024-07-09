const express = require('express');
const slugify = require('slugify');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const Generic = require('../models/genericModel');
const ProductModel = require('../models/productModel');
const verifyToken = require('../middlewares/auth');


async function createSlug(text) {
    let slug = slugify(text, { lower: true, strict: true });
    let uniqueSlug = slug;
    let count = 0;

    while (await Generic.findOne({ slug: uniqueSlug })) {
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
        const generics = await Generic.find();
        return res.status(200).json({ msg: "Success", data: generics });
    } catch (error) {
        console.error('Error fetching generics:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// GET a generic by ID (with all products who have the same genericID)
genericRoute.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const generic = await Generic.findById(id);
        if (!generic) {
            return res.status(404).json({ msg: 'Generic not found' });
        }

        // Assuming you have a Product model that references the genericID
        const products = await ProductModel.find({ genericID: id }); // Adjust the query according to your Product model
        return res.status(200).json({ msg: 'Success', data: generic, products });
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
        const { name, uses, works, sideEffects, expertAdvice, faq } = req.body;
        const slug = await createSlug(name);
        const generic = new Generic({ name, slug, uses, works, sideEffects, expertAdvice, faq });
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
        const updates = req.body;

        if (updates.name) {
            updates.slug = await createSlug(updates.name);
        }

        delete updates._id;
        delete updates.slug;
        delete updates.__V;

        const generic = await Generic.findByIdAndUpdate(id, updates, { new: true });
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
        const generic = await Generic.findByIdAndDelete(id);
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
