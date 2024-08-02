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

const passport = require('passport');
const session = require('express-session');
require('./config/passport-setup');

const DBConnection = require('./config/db');
const { rateLimiter } = require('./middlewares/rateLimiter');
const logger = require('./middlewares/logger');

const userRouter = require('./routes/userRoute');
const addressRouter = require('./routes/userAddressRoute');
const healthRecordRouter = require('./routes/healthRecordRoute');
const manufacturerRouter = require('./routes/manufacturerRoute');
const categoryRoute = require('./routes/categoryRoute');
const genericRoute = require('./routes/genericRoute');
const productRoute = require('./routes/productRoute');
const wishlistRoute = require('./routes/wishlistRoute');
const cartRoute = require('./routes/cartRoute');
const checkoutRoute = require('./routes/checkoutRoute');
const currencyRouter = require('./routes/currencyPriceRoute');

const generateToken = require('./utils/tokenUtils');

const app = express();

const Port = process.env.PORT || 4100;

// Middleware
app.use(express.json());
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(rateLimiter);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 15 * 24 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/ah/', async (req, res) => {
    return res.status(200).send({ 'msg': 'Server is Up' });
});

// Routes for Google OAuth
app.get('/ah/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

app.post('/ah/auth/google/callback', passport.authenticate('google'), (req, res) => {
    try {
        console.log(req.user);
        console.log(req.query);
        console.log(req.headers);
        console.log(req.body);
        const token = generateToken(req.user);
        const message = req.user.isNewUser ? 'Signup successful' : 'Login successful';

        res.status(200).json({
            msg: message,
            x_auth_token: token,
            x_userid: req.user._id,
            x_user: req.user.name
        });
    } catch (error) {
        res.status(500).json({ msg: 'Authentication failed', error: error.message });
    }
});

app.get('/ah/api/v1/logout', (req, res) => {
    req.logout();
    res.redirect('/');
});

// API Routes
app.use('/ah/api/v1/user', userRouter);
app.use('/ah/api/v1/address', addressRouter);
app.use('/ah/api/v1/health-record', healthRecordRouter);
app.use('/ah/api/v1/manufacturer', manufacturerRouter);
app.use('/ah/api/v1/category', categoryRoute);
app.use('/ah/api/v1/generic', genericRoute);
app.use('/ah/api/v1/product', productRoute);
app.use('/ah/api/v1/wishlist', wishlistRoute);
app.use('/ah/api/v1/cart', cartRoute);
app.use('/ah/api/v1/order', checkoutRoute);
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

// Schedule the cron job to run every 6 hours
cron.schedule('0 */6 * * *', fetchAndUpdateRates);

httpsServer.listen(Port, async () => {
    try {
        await DBConnection;
        console.log(`Connected to DB`);
    } catch (error) {
        console.error(`Connection to DB Failed: ${error.message}`);
    }
    console.log(`Server is Up on Port ${Port}`);
}).on('error', (error) => {
    console.error(`Error starting server: ${error.message}`);
});