const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const xlsx = require('xlsx');
const { check, validationResult } = require('express-validator');
const ProductModel = require('../models/productModel');
const verifyToken = require('../middlewares/auth');
const createSlug = require('../utils/slugify');
const generateSKU = require('../utils/skuGenerator');

const AWS = require('aws-sdk');
const ExchangeRate = require('../models/currencyPriceModel');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const uploadToS3 = (buffer, key, mimeType) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read'
    };

    return s3.upload(params).promise();
};

const deleteFromS3 = async (key) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
    };

    return s3.deleteObject(params).promise();
};

const generateKey = (originalname) => {
    const ext = path.extname(originalname);
    return `products/${crypto.randomBytes(16).toString('hex')}${ext}`;
};

const productRoute = express.Router();
productRoute.use(fileUpload());

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

// Route to upload Excel file and create products
productRoute.post('/import', verifyToken, async (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).send({ msg: 'No file uploaded' });
    }

    const file = req.files.file;
    const workbook = xlsx.read(file.data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet);

    const products = await Promise.all(jsonData.map(async row => {
        const variants = [];
        let index = 1;
        while (row[`Variant${index}_SKU`] || row[`Variant${index}_PackSize`] || row[`Variant${index}_Price`]) {
            variants.push({
                sku: row[`Variant${index}_SKU`] || generateSKU(),
                packSize: row[`Variant${index}_PackSize`],
                isStockAvailable: row[`Variant${index}_IsStockAvailable`] === 'true',
                price: parseFloat(row[`Variant${index}_Price`]) || 0,
                salePrice: parseFloat(row[`Variant${index}_SalePrice`]) || 0,
                margin: parseFloat(row[`Variant${index}_Margin`]) || 0,
                minOrderQuantity: parseInt(row[`Variant${index}_MinOrderQuantity`]) || 0,
                maxOrderQuantity: parseInt(row[`Variant${index}_MaxOrderQuantity`]) || 100,
                weight: parseFloat(row[`Variant${index}_Weight`]) || 0,
                weightUnit: row[`Variant${index}_WeightUnit`],
                length: parseFloat(row[`Variant${index}_Length`]) || 0,
                lengthUnit: row[`Variant${index}_LengthUnit`],
                width: parseFloat(row[`Variant${index}_Width`]) || 0,
                widthUnit: row[`Variant${index}_WidthUnit`],
                height: parseFloat(row[`Variant${index}_Height`]) || 0,
                heightUnit: row[`Variant${index}_HeightUnit`],
            });
            index++;
        }

        const images = [];
        index = 1;
        while (row[`Image${index}_URL`] || row[`Image${index}_Alt`]) {
            const imageURL = row[`Image${index}_URL`];
            if (imageURL) {
                images.push({
                    url: imageURL,
                    alt: row[`Image${index}_Alt`] || ""
                });
            }
            index++;
        }

        const slug = await createSlug(row.Title);

        return {
            title: row.Title,
            slug,
            genericID: row.GenericID,
            generic: row.Generic,
            treatment: row.Treatment,
            isReturnable: row.IsReturnable === 'true',
            isPrescriptionRequired: row.IsPrescriptionRequired === 'true',
            isVisible: row.IsVisible === 'true',
            isFeatured: row.IsFeatured === 'true',
            shortDescription: row.ShortDescription,
            description: row.Description,
            sideEffects: row.SideEffects,
            faq: row.FAQ,
            additionalInformation: row.AdditionalInformation,
            moreInformation: row.MoreInformation,
            purchaseNote: row.PurchaseNote,
            categoryID: row.CategoryID,
            tags: row.Tags,
            upSell: row.UpSell ? row.UpSell.split(',') : [],
            crossSell: row.CrossSell ? row.CrossSell.split(',') : [],
            externalLink: row.ExternalLink,
            position: parseInt(row.Position),
            manufacturerID: row.ManufacturerID,
            originCountry: row.OriginCountry,
            isDiscontinued: row.IsDiscontinued === 'true',
            metaTitle: row.MetaTitle,
            metaDescription: row.MetaDescription,
            metaTags: row.MetaTags,
            variants,
            images
        };
    }));

    try {
        await ProductModel.insertMany(products);
        res.status(201).send({ msg: 'Products uploaded successfully' });
    } catch (error) {
        console.error('Error uploading products:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to export products to Excel
productRoute.get('/export', verifyToken, async (req, res) => {
    try {
        const { categoryID, genericID, manufacturerID, originCountry } = req.query;

        const filters = {};
        if (categoryID) filters.categoryID = categoryID;
        if (genericID) filters.genericID = genericID;
        if (manufacturerID) filters.manufacturerID = manufacturerID;
        if (originCountry) filters.originCountry = originCountry;

        const products = await ProductModel.find(filters);
        const data = products.map(product => {
            const flatProduct = {
                ID: (product._id).toString(),
                Title: product.title,
                Slug: product.slug,
                GenericID: product.genericID,
                Generic: product.generic,
                Treatment: product.treatment,
                IsReturnable: product.isReturnable,
                IsPrescriptionRequired: product.isPrescriptionRequired,
                IsVisible: product.isVisible,
                IsFeatured: product.isFeatured,
                ShortDescription: product.shortDescription,
                Description: product.description,
                SideEffects: product.sideEffects,
                FAQ: product.faq,
                AdditionalInformation: product.additionalInformation,
                MoreInformation: product.moreInformation,
                PurchaseNote: product.purchaseNote,
                CategoryID: product.categoryID,
                Tags: product.tags,
                UpSell: product.upSell.join(','),
                CrossSell: product.crossSell.join(','),
                ExternalLink: product.externalLink,
                Position: product.position,
                ManufacturerID: product.manufacturerID,
                OriginCountry: product.originCountry,
                IsDiscontinued: product.isDiscontinued,
                MetaTitle: product.metaTitle,
                MetaDescription: product.metaDescription,
                MetaTags: product.metaTags,
                ...product.variants.reduce((acc, variant, index) => {
                    acc[`Variant${index + 1}_SKU`] = variant.sku;
                    acc[`Variant${index + 1}_PackSize`] = variant.packSize;
                    acc[`Variant${index + 1}_IsStockAvailable`] = variant.isStockAvailable;
                    acc[`Variant${index + 1}_Price`] = variant.price;
                    acc[`Variant${index + 1}_SalePrice`] = variant.salePrice;
                    acc[`Variant${index + 1}_Margin`] = variant.margin;
                    acc[`Variant${index + 1}_MinOrderQuantity`] = variant.minOrderQuantity;
                    acc[`Variant${index + 1}_MaxOrderQuantity`] = variant.maxOrderQuantity;
                    acc[`Variant${index + 1}_Weight`] = variant.weight;
                    acc[`Variant${index + 1}_WeightUnit`] = variant.weightUnit;
                    acc[`Variant${index + 1}_Length`] = variant.length;
                    acc[`Variant${index + 1}_LengthUnit`] = variant.lengthUnit;
                    acc[`Variant${index + 1}_Width`] = variant.width;
                    acc[`Variant${index + 1}_WidthUnit`] = variant.widthUnit;
                    acc[`Variant${index + 1}_Height`] = variant.height;
                    acc[`Variant${index + 1}_HeightUnit`] = variant.heightUnit;
                    return acc;
                }, {}),
                ...product.images.reduce((acc, image, index) => {
                    acc[`Image${index + 1}_URL`] = image.url;
                    acc[`Image${index + 1}_Alt`] = image.alt;
                    return acc;
                }, {})
            };
            return flatProduct;
        });

        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Products');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting products:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Validation rules for creating/updating products
const productValidationRules = [
    check('title').notEmpty().withMessage('Title is required'),
    check('genericID').notEmpty().withMessage('Generic ID is required'),
    check('variants.*.sku').notEmpty().withMessage('SKU is required for each variant'),
    check('variants.*.price').optional().isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
    check('variants.*.salePrice').optional().isFloat({ min: 0 }).withMessage('Sale price must be a non-negative number'),
    check('variants.*.minOrderQuantity').optional().isInt({ min: 0 }).withMessage('Min order quantity must be a non-negative integer'),
    check('variants.*.maxOrderQuantity').optional().isInt({ min: 0 }).withMessage('Max order quantity must be a non-negative integer'),
    check('variants.*.weight').optional().isFloat({ min: 0 }).withMessage('Weight must be a non-negative number'),
    check('variants.*.length').optional().isFloat({ min: 0 }).withMessage('Length must be a non-negative number'),
    check('variants.*.width').optional().isFloat({ min: 0 }).withMessage('Width must be a non-negative number'),
    check('variants.*.height').optional().isFloat({ min: 0 }).withMessage('Height must be a non-negative number')
];

// Route to create a new product
productRoute.post('/', verifyToken, productValidationRules, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const data = req.body;
        delete data._id;
        delete data.images;
        delete data.__v;
        delete data.createdAt;
        delete data.updatedAt;

        data.slug = await createSlug(data.title);
        const product = new ProductModel(data);
        await product.save();
        res.status(201).send({ msg: 'Product created successfully', product });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to update a product by ID
productRoute.patch('/:id', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    try {
        const data = req.body;
        delete data._id;
        delete data.slug;
        delete data.images;
        delete data.__v;
        delete data.createdAt;
        delete data.updatedAt;

        if (data.variants) {
            data.variants.map(item => {
                delete item._id;
            })
        }

        const product = await ProductModel.findByIdAndUpdate(req.params.id, data, { new: true });
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }
        res.status(200).send({ msg: 'Product updated successfully', data: product });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to add new images to a product
productRoute.post('/:id/images', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    try {
        const product = await ProductModel.findById(req.params.id);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        const files = req.files;
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).send({ msg: 'No images provided.' });
        }

        // Ensure files.images is an array
        let imagesArray = Array.isArray(files.images) ? files.images : [files.images];

        // Upload new images to S3
        const uploadPromises = imagesArray.map(async (file) => {
            const s3Key = generateKey(file.name);
            const uploadResult = await uploadToS3(file.data, s3Key, file.mimetype);
            return { url: uploadResult.Location, key: s3Key, alt: file.name };
        });

        const newImages = await Promise.all(uploadPromises);

        // Add new images to product
        product.images.push(...newImages);
        await product.save();

        res.status(200).send({ msg: 'Images added successfully', data: product.images });
    } catch (error) {
        console.error('Error adding images:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to delete a single image by its _id
productRoute.delete('/:id/single-image/:imageId', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    try {
        const product = await ProductModel.findById(req.params.id);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        const imageId = req.params.imageId;
        const imageIndex = product.images.findIndex(image => image._id.toString() === imageId);
        console.log(imageIndex);
        if (imageIndex === -1) {
            return res.status(404).send({ msg: 'Image not found' });
        }

        const imageKey = product.images[imageIndex].key;

        // Remove image from S3
        await deleteFromS3(imageKey);

        // Remove image from product
        product.images.splice(imageIndex, 1);
        await product.save();

        res.status(200).send({ msg: 'Image deleted successfully', data: product.images });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Route to delete all images of a product
productRoute.delete('/:id/images', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    try {
        const product = await ProductModel.findById(req.params.id);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        // Remove all images from S3
        const deletePromises = product.images.map(async (image) => {
            await deleteFromS3(image.key);
        });
        await Promise.all(deletePromises);

        // Clear images from product
        product.images = [];
        await product.save();

        res.status(200).send({ msg: 'All images deleted successfully', data: product });
    } catch (error) {
        console.error('Error deleting all images:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to delete a product and its images from S3
productRoute.delete('/:id', verifyToken, async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).send({ msg: 'Access Denied' });
    }

    try {
        const product = await ProductModel.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        const regex = new RegExp('amazonaws.com');;

        // Remove images from S3
        const deletePromises = product.images.map(async (image) => {
            if (regex.test(image)) {
                await deleteFromS3(image.key);
            }
        });
        await Promise.all(deletePromises);

        res.status(200).send({ msg: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to fetch all products with pagination, filtering, and sorting (currency added)
productRoute.get('/search/', async (req, res) => {
    try {
        const { search = '' } = req.query;

        const filters = {};

        const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

        if (search) {
            filters.$or = [
                { title: new RegExp(search, 'i') },
                { slug: new RegExp(search, 'i') },
                { treatment: new RegExp(search, 'i') },
                { originCountry: new RegExp(search, 'i') },
                { tags: new RegExp(search, 'i') },
                { 'variants.sku': new RegExp(search, 'i') },
                { 'variants.packSize': new RegExp(search, 'i') }
            ];
            if (isValidObjectId(search)) {
                filters.$or.push({ genericID: search });
                filters.$or.push({ categoryID: search });
                filters.$or.push({ manufacturerID: search });
                filters.$or.push({ _id: search });
            }
        }

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        const country = req.query.country || 'INDIA';
        const currency = req.query.currency || 'INR';

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        const products = await ProductModel.find(filters)
            .collation({ locale: 'en', strength: 2 })
            .lean();

        // Adjust product prices based on exchange rate and country selection
        products.forEach(product => {
            product.variants.forEach(variant => {
                const indianMRP = variant.price || 0;
                const indianSaleMRP = variant.salePrice || 0;
                const margin = variant.margin / 100 || 0.01;

                if (country === 'INDIA') {
                    if (exchangeRate.rate !== 1) { // Currency other than INR
                        variant.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                        variant.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                    } else {
                        variant.price = Number(indianMRP.toFixed(2));
                        variant.salePrice = Number(indianSaleMRP.toFixed(2));
                    }
                } else { // OUTSIDE INDIA
                    const priceWithMargin = indianMRP * (1 + margin);
                    const salePriceWithMargin = indianSaleMRP * (1 + margin);

                    variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
                }
                variant.currency = currencySymbol; // Set the currency symbol
            });
        });

        res.status(200).send({
            msg: 'Success',
            data: products
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to fetch all products with pagination, filtering, sorting (currency added)
productRoute.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filters = {};
        const {
            search, minPrice, maxPrice, packSize, isVisible,
            sortBy = 'title', order = 'asc', country = 'INDIA', currency = 'INR'
        } = req.query;

        console.log(search);

        const regex = new RegExp(search, 'i');

        if (search) {
            filters.$or = [
                { title: { $regex: regex } },
                { slug: { $regex: regex } },
                { 'variants.sku': { $regex: regex } },
                { treatment: { $regex: regex } },
                { generic: { $regex: regex } },
                { tags: { $regex: regex } },
                { originCountry: { $regex: regex } }
            ];

            if (isValidObjectId(search)) {
                filters.$or.push({ _id: search });
                filters.$or.push({ genericID: search });
                filters.$or.push({ categoryID: search });
                filters.$or.push({ manufacturerID: search });
            }
        }

        if (minPrice) filters['variants.price'] = { ...filters['variants.price'], $gte: parseFloat(minPrice) };
        if (maxPrice) filters['variants.price'] = { ...filters['variants.price'], $lte: parseFloat(maxPrice) };
        if (packSize) filters['variants.packSize'] = packSize;
        if (isVisible) filters.isVisible = isVisible === 'true';

        const sortOptions = {};
        if (['title', 'createdAt', 'lastModified'].includes(sortBy)) {
            sortOptions[sortBy] = order === 'desc' ? -1 : 1;
        } else {
            sortOptions.title = 1; // Default sorting by title
        }

        const totalProducts = await ProductModel.countDocuments(filters);
        const totalPages = Math.ceil(totalProducts / limit);

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        const products = await ProductModel.find(filters)
            .skip(skip)
            .limit(limit)
            .sort(sortOptions)
            .collation({ locale: 'en', strength: 2 })
            .lean();

        // Adjust product prices based on exchange rate and country selection
        products.forEach(product => {
            product.variants.forEach(variant => {
                const indianMRP = variant.price || 0;
                const indianSaleMRP = variant.salePrice || 0;
                const margin = variant.margin / 100 || 0.01; // Default margin is 1% if not provided

                if (country === 'INDIA') {
                    if (exchangeRate.rate !== 1) {
                        variant.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                        variant.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                    } else {
                        variant.price = Number(indianMRP.toFixed(2));
                        variant.salePrice = Number(indianSaleMRP.toFixed(2));
                    }
                } else {
                    const priceWithMargin = indianMRP * (1 + margin);
                    const salePriceWithMargin = indianSaleMRP * (1 + margin);

                    variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
                }
                variant.currency = currencySymbol;
            });
        });

        res.status(200).send({
            msg: 'Success',
            data: products,
            totalProducts,
            totalPages,
            currentPage: page,
            pageSize: limit
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to fetch a single product by ID (currency added)
productRoute.get('/:id', async (req, res) => {
    try {
        const product = await ProductModel.findById(req.params.id).lean();
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        const country = req.query.country || 'INDIA';
        const currency = req.query.currency || 'INR';

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Adjust product prices based on exchange rate and country selection
        product.variants.forEach(variant => {
            const indianMRP = variant.price || 0;
            const indianSaleMRP = variant.salePrice || 0;
            const margin = variant.margin / 100 || 0.01;

            if (country === 'INDIA') {
                if (exchangeRate.rate !== 1) { // Currency other than INR
                    variant.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                } else {
                    variant.price = Number(indianMRP.toFixed(2));
                    variant.salePrice = Number(indianSaleMRP.toFixed(2));
                }
            } else { // OUTSIDE INDIA
                const priceWithMargin = indianMRP * (1 + margin);
                const salePriceWithMargin = indianSaleMRP * (1 + margin);

                variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
            }
            variant.currency = currencySymbol; // Set the currency symbol
        });

        res.status(200).send({ msg: 'Success', data: product });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to fetch products by category ID (currency added)
productRoute.get('/category/:id', async (req, res) => {
    try {
        const products = await ProductModel.find({ categoryID: req.params.id }).lean();
        if (!products || products.length === 0) {
            return res.status(404).send({ msg: 'No products found for this category' });
        }

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        const country = req.query.country || 'INDIA';
        const currency = req.query.currency || 'INR';

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Adjust product prices based on exchange rate and country selection
        products.forEach(product => {
            product.variants.forEach(variant => {
                const indianMRP = variant.price || 0;
                const indianSaleMRP = variant.salePrice || 0;
                const margin = variant.margin / 100 || 0.01;

                if (country === 'INDIA') {
                    if (exchangeRate.rate !== 1) { // Currency other than INR
                        variant.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                        variant.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                    } else {
                        variant.price = Number(indianMRP.toFixed(2));
                        variant.salePrice = Number(indianSaleMRP.toFixed(2));
                    }
                } else { // OUTSIDE INDIA
                    const priceWithMargin = indianMRP * (1 + margin);
                    const salePriceWithMargin = indianSaleMRP * (1 + margin);

                    variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
                }
                variant.currency = currencySymbol; // Set the currency symbol
            });
        });

        res.status(200).send({ msg: 'Success', data: products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to fetch a single product by slug (currency added)
productRoute.get('/slug/:slug', async (req, res) => {
    try {
        const product = await ProductModel.findOne({ slug: req.params.slug }).lean();
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        // Fetch exchange rate based on user's selected currency
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        const country = req.query.country || 'INDIA';
        const currency = req.query.currency || 'INR';

        if (currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Adjust product prices based on exchange rate and country selection
        product.variants.forEach(variant => {
            const indianMRP = variant.price || 0;
            const indianSaleMRP = variant.salePrice || 0;
            const margin = variant.margin / 100 || 0.01;

            if (country === 'INDIA') {
                if (exchangeRate.rate !== 1) { // Currency other than INR
                    variant.price = Number((indianMRP * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((indianSaleMRP * exchangeRate.rate).toFixed(2));
                } else {
                    variant.price = Number(indianMRP.toFixed(2));
                    variant.salePrice = Number(indianSaleMRP.toFixed(2));
                }
            } else { // OUTSIDE INDIA
                const priceWithMargin = indianMRP * (1 + margin);
                const salePriceWithMargin = indianSaleMRP * (1 + margin);

                variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
            }
            variant.currency = currencySymbol; // Set the currency symbol
        });

        res.status(200).send({ msg: 'Success', data: product });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

module.exports = productRoute;
