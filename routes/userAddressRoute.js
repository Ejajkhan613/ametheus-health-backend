const express = require('express');
const { check, validationResult } = require('express-validator');
const Address = require('../models/userAddressModel');
const verifyToken = require('../middlewares/auth');

const addressRouter = express.Router();

// Get all addresses for the authenticated user
addressRouter.get('/', verifyToken, async (req, res) => {
    try {
        const addresses = await Address.find({ userId: req.userDetail._id }).select('-userId -__v');
        res.status(200).json({ msg: 'Success', data: addresses });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Get address by ID for the authenticated user
addressRouter.get('/:id', verifyToken, async (req, res) => {
    try {
        const address = await Address.findOne({ _id: req.params.id, userId: req.userDetail._id }).select('-userId -__v');
        if (!address) {
            return res.status(404).json({ msg: 'Address not found' });
        }
        res.status(200).json({ msg: 'Success', data: address });
    } catch (error) {
        console.error('Error fetching address by ID:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Validation middleware for address operations
const validateAddress = [
    check('houseNumber').notEmpty(),
    check('locality').notEmpty(),
    check('city').notEmpty(),
    check('state').notEmpty(),
    check('country').notEmpty(),
    check('zipcode').notEmpty(),
    check('addressType').isIn(['HOME', 'OFFICE', 'OTHER']),
    check('mobileNumber').notEmpty(),
    check('name').notEmpty()
];

// Create a new address for the authenticated user
addressRouter.post('/', validateAddress, verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const body = req.body;
        delete body.userId;

        const address = new Address({
            ...body,
            userId: req.userDetail._id
        });
        await address.save();

        const data = address.toObject();
        delete data.userId;
        delete data.__v;

        res.status(201).json({ msg: 'Address created successfully', data });
    } catch (error) {
        console.error('Error creating address:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Update an address for the authenticated user
addressRouter.patch('/:id', validateAddress, verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const body = req.body;
        delete body.userId;

        const address = await Address.findOneAndUpdate(
            { _id: req.params.id, userId: req.userDetail._id },
            body,
            { new: true }
        );
        if (!address) {
            return res.status(404).json({ msg: 'Address not found' });
        }

        const data = address.toObject();
        delete data.userId;
        delete data.__v;

        res.status(200).json({ msg: 'Address updated successfully', data });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

// Delete an address for the authenticated user
addressRouter.delete('/:id', verifyToken, async (req, res) => {
    try {
        const address = await Address.findOneAndDelete({ _id: req.params.id, userId: req.userDetail._id });
        if (!address) {
            return res.status(404).json({ msg: 'Address not found' });
        }
        res.status(200).json({ msg: 'Address deleted successfully' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});

module.exports = addressRouter;