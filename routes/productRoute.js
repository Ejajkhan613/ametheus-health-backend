const express = require('express');
const fileUpload = require('express-fileupload');
const xlsx = require('xlsx');
const { check, validationResult } = require('express-validator');
const ProductModel = require('../models/productModel');
const verifyToken = require('../middlewares/auth');
const createSlug = require('../utils/slugify');
const generateSKU = require('../utils/skuGenerator');

const AWS = require('aws-sdk');

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

const productRouter = express.Router();
productRouter.use(fileUpload());

// Route to upload Excel file and create products
productRouter.post('/import', verifyToken, async (req, res) => {
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
productRouter.get('/export', verifyToken, async (req, res) => {
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
productRouter.post('/', verifyToken, productValidationRules, async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        req.body.slug = createSlug(req.body.title);
        const product = new ProductModel(req.body);
        await product.save();
        res.status(201).send({ msg: 'Product created successfully', data: product });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to update/add images to a product
productRouter.patch('/:id/images', verifyToken, async (req, res) => {
    try {
        const product = await ProductModel.findById(req.params.id);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        const files = req.files;
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).send({ msg: 'No files were uploaded.' });
        }

        // Remove existing images from S3
        const deletePromises = product.images.map(async (image) => {
            await deleteFromS3(image.key);
        });
        await Promise.all(deletePromises);

        // Upload new images to S3
        const uploadPromises = Object.keys(files).map(async (key) => {
            const file = files[key];
            const s3Key = generateKey(file.name);
            const uploadResult = await uploadToS3(file.data, s3Key, file.mimetype);
            return { url: uploadResult.Location, key: s3Key, alt: file.name };
        });

        const newImages = await Promise.all(uploadPromises);

        // Update product with new images
        product.images = newImages;
        await product.save();

        res.status(200).send({ msg: 'Images updated successfully', data: product.images });
    } catch (error) {
        console.error('Error updating images:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to delete a product and its images from S3
productRouter.delete('/:id', verifyToken, async (req, res) => {
    try {
        const product = await ProductModel.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }

        // Remove images from S3
        const deletePromises = product.images.map(async (image) => {
            await deleteFromS3(image.key);
        });
        await Promise.all(deletePromises);

        res.status(200).send({ msg: 'Product and its images deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to fetch all products with pagination, filtering, and sorting
productRouter.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filters = {};
        const {
            title, slug, sku, genericID, treatment, minPrice, maxPrice, packSize,
            categoryID, manufacturerID, tags, originCountry, isVisible
        } = req.query;

        if (title) filters.title = new RegExp(title, 'i');
        if (slug) filters.slug = new RegExp(slug, 'i');
        if (sku) filters['variants.sku'] = new RegExp(sku, 'i');
        if (genericID) filters.genericID = genericID;
        if (treatment) filters.treatment = new RegExp(treatment, 'i');
        if (minPrice) filters['variants.price'] = { ...filters['variants.price'], $gte: parseFloat(minPrice) };
        if (maxPrice) filters['variants.price'] = { ...filters['variants.price'], $lte: parseFloat(maxPrice) };
        if (packSize) filters['variants.packSize'] = packSize;
        if (categoryID) filters.categoryID = categoryID;
        if (manufacturerID) filters.manufacturerID = manufacturerID;
        if (tags) filters.tags = new RegExp(tags, 'i');
        if (originCountry) filters.originCountry = originCountry;
        if (isVisible) filters.isVisible = isVisible === 'true';

        const sortOptions = {};
        const { sortBy, order } = req.query;
        if (sortBy && order) {
            sortOptions[sortBy] = order === 'asc' ? 1 : -1;
        }

        const totalProducts = await ProductModel.countDocuments(filters);
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await ProductModel.find(filters)
            .skip(skip)
            .limit(limit)
            .sort(sortOptions);

        res.status(200).send({
            msg: 'Success',
            data: products,
            pagination: {
                totalProducts,
                totalPages,
                currentPage: page,
                pageSize: limit
            }
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to fetch a single product by ID
productRouter.get('/:id', verifyToken, async (req, res) => {
    try {
        const product = await ProductModel.findById(req.params.id);
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }
        res.status(200).send({ msg: 'Success', data: product });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Route to update a product by ID
productRouter.put('/:id', verifyToken, async (req, res) => {
    try {
        const product = await ProductModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!product) {
            return res.status(404).send({ msg: 'Product not found' });
        }
        res.status(200).send({ msg: 'Product updated successfully', data: product });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


module.exports = productRouter;
