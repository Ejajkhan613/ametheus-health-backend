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
const jwt = require('jsonwebtoken');

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

const UserModel = require('./models/userModel');
const generateUHID = require('./utils/uhidGenerator');
const generateSecurePassword = require('./utils/passwordUtils');

const app = express();

const Port = process.env.PORT || 4100;

// Middleware
app.use(express.json());
app.use(helmet());
// app.use(cors());
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(rateLimiter);

// Middleware
app.use(cors({
    origin: ['https://ah-medicine-new.vercel.app', 'https://ametheushealth-admin-dashboard.vercel.app/'], // Replace with your frontend domain
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
}));
app.use(bodyParser.json());


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


// Endpoint to handle Google OAuth callback
app.post('/ah/auth/google/callback', async (req, res) => {
    const { token } = req.body;

    try {
        console.log(token);
        // Verify the token with Google
        const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
        const { email, sub: googleId, name } = response.data;

        // Custom logic to create or retrieve the user from your database
        let user = await findOrCreateUser({ googleId, email, name });
        console.log(user);

        // Generate a JWT token for the authenticated user
        const x_auth_token = jwt.sign({ userID: user._id }, process.env.SECRET_KEY, { expiresIn: '15d' });

        // Respond with the token and user information
        res.json({
            x_auth_token,
            x_user: user.name,
            x_userid: user._id
        });
    } catch (error) {
        console.error("Error in Google OAuth callback:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Function to find or create a user
const findOrCreateUser = async ({ googleId, email, name }) => {
    // Check if user exists
    let user = await UserModel.findOne({ googleId });

    if (!user) {
        const uhid = await generateUHID();
        const password = generateSecurePassword();
        const hashedPass = await bcrypt.hash(password, 11);
        // If user does not exist, create a new one
        user = new UserModel({
            googleId,
            email,
            name,
            uhid,
            password: hashedPass,
            authMethod: 'google'
        });
        await user.save();
    }

    return user;
};



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

// HTTPS Server Configuration
const privateKey = fs.readFileSync('../etc/letsencrypt/live/api.assetorix.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('../etc/letsencrypt/live/api.assetorix.com/cert.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Starting HTTPS Server
const httpsServer = https.createServer(credentials, app);

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