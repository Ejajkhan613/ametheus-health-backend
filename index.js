// index.js
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const DBConnection = require('./config/db');
const { rateLimiter } = require('./middlewares/rateLimiter');
const logger = require('./middlewares/logger');
const userRouter = require('./routes/userRoute');
const addressRouter = require('./routes/userAddressRoute');
const healthRecordRouter = require('./routes/healthRecordRoute');
const manufacturerRouter = require('./routes/manufacturerRoute');
const cateogryRoute = require('./routes/categoryRoute');
const productRouter = require('./routes/productRoute');

const app = express();

const Port = process.env.PORT || 3900;

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

// Medicines
app.use('/ah/api/v1/product', productRouter);




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
        console.log(`Connection to DB Failed`)
    }
    console.log(`Server is Up on Port ${Port}`)
})
