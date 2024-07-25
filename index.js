// index.js
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const cron = require('node-cron');
const axios = require('axios');
const ExchangeRate = require('./models/currencyPriceModel');

const DBConnection = require('./config/db');
const { rateLimiter } = require('./middlewares/rateLimiter');
const logger = require('./middlewares/logger');

const userRouter = require('./routes/userRoute');
const addressRouter = require('./routes/userAddressRoute');
const healthRecordRouter = require('./routes/healthRecordRoute');
const manufacturerRouter = require('./routes/manufacturerRoute');
const cateogryRoute = require('./routes/categoryRoute');
const genericRoute = require('./routes/genericRoute');
const productRoute = require('./routes/productRoute');
const wishlistRoute = require('./routes/wishlistRoute');
const cartRoute = require('./routes/cartRoute');
const checkoutRoute = require('./routes/checkoutRoute');
const currencyRouter = require('./routes/currencyPriceRoute');

const app = express();

const Port = process.env.PORT || 4100;

// Middleware
app.use(express.json());
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(rateLimiter);
// app.use(logger);

// Routes
app.get('/ah/', async (req, res) => {
    return res.status(300).send({ 'msg': 'Server is Up' });
})

// User
app.use('/ah/api/v1/user', userRouter);

// User Address
app.use('/ah/api/v1/address', addressRouter);

// Health Records
app.use('/ah/api/v1/health-record', healthRecordRouter);

// Medicine Manufacturer
app.use('/ah/api/v1/manufacturer', manufacturerRouter);

// Medicine Category
app.use('/ah/api/v1/category', cateogryRoute);

// Medicine Generic
app.use('/ah/api/v1/generic', genericRoute);

// Medicines
app.use('/ah/api/v1/product', productRoute);

// Wishlist
app.use('/ah/api/v1/wishlist', wishlistRoute);

// Cart
app.use('/ah/api/v1/cart', cartRoute);

// Order
app.use('/ah/api/v1/order', checkoutRoute);

// Cart
app.use('/ah/api/v1/currency', currencyRouter);




// HTTPS Server Configuration
const privateKey = fs.readFileSync('../etc/letsencrypt/live/api.assetorix.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('../etc/letsencrypt/live/api.assetorix.com/cert.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Starting HTTPS Server
const httpsServer = https.createServer(credentials, app);


const fetchAndUpdateRates = async () => {
    try {
        const response = await axios.get('https://v6.exchangerate-api.com/v6/136d8bdde0f5c2356bc2125f/latest/INR');
        const data = response.data;

        if (data.result === 'success') {
            const conversionRates = data.conversion_rates;
            const currencies = ['USD', 'EUR', 'GBP', 'RUB', 'AED'];

            for (const currency of currencies) {
                const rate = conversionRates[currency];
                if (rate) {
                    await ExchangeRate.findOneAndUpdate(
                        { currency },
                        { rate, lastUpdated: Date.now() },
                        { upsert: true }
                    );
                }
            }
        } else {
            console.error('Error fetching exchange rates:', data);
        }
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
    }
};


// Scheduled the cron job to run every 6 hours
cron.schedule('0 */6 * * *', fetchAndUpdateRates);


httpsServer.listen(Port, async () => {
    try {
        await DBConnection;
        console.log(`Connected to DB`);
    } catch (error) {
        console.log(`Connection to DB Failed`)
    }
    console.log(`Server is Up on Port ${Port}`)
})
