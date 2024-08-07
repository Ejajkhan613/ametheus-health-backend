const express = require('express');
const router = express.Router();
const DeliveryCharge = require('../models/deliveryChargeModel');


async function getDeliveryCharge(country, amount) {
    try {
        // Find the delivery charge configuration for the specified country
        const deliveryCharges = await DeliveryCharge.findOne({ country });

        if (!deliveryCharges) {
            return { "msg": 'Delivery charge not found for this country', "status": 400 };
        }

        // Iterate through the slabs to find the applicable charge
        for (const slab of deliveryCharges.deliveryCharge) {
            if (amount >= slab.minAmount && amount <= slab.maxAmount) {
                return { "msg": slab.charge, "status": 200 };
            }
        }

        // Default case if no slab matches
        return { "msg": 'Delivery Charge Not Found', "status": 400 };
    } catch (error) {
        console.error('Error fetching delivery charge:', error);
        return { "msg": 'Delivery Charge Not Found', "status": 400 };
    }
}


// Create a new delivery charge entry
router.post('/', async (req, res) => {
    try {
        const deliveryCharge = new DeliveryCharge(req.body);
        const result = await deliveryCharge.save();
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all delivery charge entries
router.get('/', async (req, res) => {
    try {
        const deliveryCharges = await DeliveryCharge.find();
        res.status(200).json(deliveryCharges);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get delivery charge by country
router.get('/:country', async (req, res) => {
    try {
        const deliveryCharge = await DeliveryCharge.findOne({ country: req.params.country });
        if (!deliveryCharge) {
            return res.status(404).json({ error: 'Delivery charge not found' });
        }
        res.status(200).json(deliveryCharge);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update delivery charge by country
router.put('/:country', async (req, res) => {
    try {
        const deliveryCharge = await DeliveryCharge.findOneAndUpdate(
            { country: req.params.country },
            req.body,
            { new: true, runValidators: true }
        );
        if (!deliveryCharge) {
            return res.status(404).json({ error: 'Delivery charge not found' });
        }
        res.status(200).json(deliveryCharge);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete delivery charge by country
router.delete('/:country', async (req, res) => {
    try {
        const result = await DeliveryCharge.findOneAndDelete({ country: req.params.country });
        if (!result) {
            return res.status(404).json({ error: 'Delivery charge not found' });
        }
        res.status(200).json({ message: 'Delivery charge deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = { router, getDeliveryCharge };