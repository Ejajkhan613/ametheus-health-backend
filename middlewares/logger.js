// middlewares/logger.js
const LogModel = require('../models/logsModel');

const logger = async (req, res, next) => {
    const logEntry = new LogModel({
        ip: req.ip,
        method: req.method,
        url: req.originalUrl,
        device: req.headers['user-agent'] || 'Unknown',
        status: res.statusCode
    });

    try {
        await logEntry.save();
    } catch (error) {
        console.error('Error saving log:', error);
    }

    next();
};

module.exports = logger;
