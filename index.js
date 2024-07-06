// index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const Port = process.env.PORT || 3000;
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

// Middleware
app.use(express.json());
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(rateLimiter);
// app.use(logger);

// Routes
app.get('/', async (req, res) => {
    return res.status(300).send({ 'msg': 'Server is Up' });
})

// User
app.use('/api/v1/user', userRouter);

// User Address
app.use('/api/v1/address', addressRouter);

// Health Records
// app.use('/api/v1/health-record', healthRecordRouter);

// Medicine Manufacturer
app.use('/api/v1/manufacturer', manufacturerRouter);

// Medicine Category
app.use('/api/v1/category', cateogryRoute);

// Medicines
app.use('/api/v1/product', productRouter);


app.listen(Port, async (req, res) => {
    try {
        await DBConnection;
        console.log(`Connected to DB`);
    } catch (error) {
        console.log(`Connection to DB Failed`)
    }
    console.log(`Server is Up on Port ${Port}`)
})
