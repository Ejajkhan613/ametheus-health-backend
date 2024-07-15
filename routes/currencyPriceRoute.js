// routes/currencyPriceRoute.js
const express = require('express');
const mongoose = require('mongoose');
const currencyRouter = express.Router();
const ExchangeRate = require('../models/currencyPriceModel');

// Get all exchange rates
currencyRouter.get('/exchange-rates', async (req, res) => {
    try {
        const rates = await ExchangeRate.find();
        res.status(200).json(rates);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get a specific exchange rate
currencyRouter.get('/exchange-rates/:currency', async (req, res) => {
    try {
        const rate = await ExchangeRate.findOne({ currency: req.params.currency });
        if (!rate) {
            return res.status(404).json({ message: 'Currency not found' });
        }
        res.status(200).json(rate);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create or update an exchange rate
currencyRouter.post('/exchange-rates', async (req, res) => {
    const { currency, rate } = req.body;

    try {
        let exchangeRate = await ExchangeRate.findOne({ currency });
        if (exchangeRate) {
            exchangeRate.rate = rate;
            exchangeRate.lastUpdated = Date.now();
        } else {
            exchangeRate = new ExchangeRate({ currency, rate });
        }
        await exchangeRate.save();
        res.status(200).json(exchangeRate);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete an exchange rate
currencyRouter.delete('/exchange-rates/:currency', async (req, res) => {
    try {
        const rate = await ExchangeRate.findOneAndDelete({ currency: req.params.currency });
        if (!rate) {
            return res.status(404).json({ message: 'Currency not found' });
        }
        res.status(200).json({ message: 'Currency deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = currencyRouter;