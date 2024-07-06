// utils/uhidGenerator.js
const CounterModel = require('../models/counterModel');

// Function to generate a unique UHID
async function generateUHID() {
    const counter = await CounterModel.findOneAndUpdate(
        { name: 'user_uhid' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    const uniqueNumber = counter.seq + 1000000000;
    return `AH${uniqueNumber}`;
}


module.exports = generateUHID;