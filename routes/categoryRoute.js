const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Category = require('../models/categoryModel');
const categorySlugify = require('../utils/categorySlugify');
const ExchangeRate = require('../models/currencyPriceModel');
const ProductModel = require('../models/productModel');

const categoryRoute = express.Router();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_BUCKET_NAME,
        acl: 'public-read',
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 1000 * 1024 * 1024 }, // 1GB limit
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|pdf|webp|doc|docx/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: File upload only supports the following filetypes - ' + filetypes);
        }
    }
});

const deleteFileFromS3 = async (fileUrl) => {
    const bucket = process.env.AWS_BUCKET_NAME;
    const key = fileUrl.split('/').slice(-1)[0];
    const deleteParams = {
        Bucket: bucket,
        Key: key
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
};



// Add Category (initially without image or docFileURL)
categoryRoute.post('/', [
    body('name').notEmpty().withMessage('Category name is required'),
    body('description').optional().isString(),
    body('parent').optional().isMongoId().withMessage('Parent must be a valid category ID')
], async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, description, parent, metaTitle, metaDescription, metaTags } = req.body;
        const slug = await categorySlugify(name);
        console.log(slug);
        const category = new Category({ name, description, slug, parent, metaTitle, metaDescription, metaTags });

        if (parent) {
            const parentCategory = await Category.findById(parent);
            if (!parentCategory) {
                return res.status(404).send({ msg: 'Parent category not found' });
            }
            parentCategory.children.push(category._id);
            await parentCategory.save();
        }

        await category.save();
        return res.status(201).send({ msg: 'Category created successfully', data: category });
    } catch (error) {
        console.error('Error creating category:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Add Image to Category
categoryRoute.patch('/:id/image', upload.single('image'), async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        if (category.image) {
            await deleteFileFromS3(category.image);
        }

        category.image = req.file.location;
        await category.save();

        return res.status(200).send({ msg: 'Category image updated successfully', data: category });
    } catch (error) {
        console.error('Error updating category image:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Delete Image from Category
categoryRoute.delete('/:id/image', async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        if (category.image) {
            await deleteFileFromS3(category.image);
            category.image = '';
            await category.save();
            return res.status(200).send({ msg: 'Category image deleted successfully', data: category });
        } else {
            return res.status(404).send({ msg: 'No image found for this category' });
        }
    } catch (error) {
        console.error('Error deleting category image:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Add Document to Category
categoryRoute.patch('/:id/docFile', upload.single('file'), async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        if (category.docFileURL) {
            await deleteFileFromS3(category.docFileURL);
        }

        category.docFileURL = req.file.location;
        await category.save();

        return res.status(200).send({ msg: 'Category document updated successfully', data: category });
    } catch (error) {
        console.error('Error updating category document:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Delete Document from Category
categoryRoute.delete('/:id/docFile', async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        if (category.docFileURL) {
            await deleteFileFromS3(category.docFileURL);
            category.docFileURL = '';
            await category.save();
            return res.status(200).send({ msg: 'Category document deleted successfully', data: category });
        } else {
            return res.status(404).send({ msg: 'No document found for this category' });
        }
    } catch (error) {
        console.error('Error deleting category document:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Update Category (excluding image and docFileURL)
categoryRoute.patch('/:id', [
    body('name').optional().isString().withMessage('Category name must be a string'),
    body('description').optional().isString(),
    body('parent').optional().custom(value => {
        if (value !== null && value !== '' && !mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Parent must be a valid category ID or null');
        }
        return true;
    })
], async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const updates = req.body;
        console.log(updates);

        // Fetch existing category to compare name and handle slug
        const existingCategory = await Category.findById(id);
        if (!existingCategory) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        // Handle slug change if name is updated
        if (updates.name && updates.name !== existingCategory.name) {
            updates.slug = await categorySlugify(updates.name, { lower: true });
        }

        // Prevent modifications to restricted fields
        const restrictedFields = ['image', 'docFileURL', '_id', '__v', 'children', 'createdAt', 'lastModified'];
        restrictedFields.forEach(field => delete updates[field]);

        // Handle parent category change
        if (updates.parent !== null) {
            const oldParentId = existingCategory.parent;
            const newParentId = updates.parent;

            // If old parent is null and new parent is null, do nothing
            if (oldParentId === null && newParentId === null) {
                // Do nothing
            } else {
                // If old parent is null and new parent is not null
                if (oldParentId === null && newParentId !== null) {
                    const newParentCategory = await Category.findById(newParentId);
                    if (!newParentCategory) {
                        return res.status(404).send({ msg: 'New parent category not found' });
                    }
                    newParentCategory.children.addToSet(id);
                    await newParentCategory.save();
                } else if (oldParentId !== null) {
                    // If old parent is not null, remove current category from old parent's children
                    const oldParentCategory = await Category.findById(oldParentId);
                    if (oldParentCategory) {
                        oldParentCategory.children.pull(id);
                        await oldParentCategory.save();
                    }

                    // If new parent is not null, add current category to new parent's children
                    if (newParentId !== null) {
                        const newParentCategory = await Category.findById(newParentId);
                        if (!newParentCategory) {
                            return res.status(404).send({ msg: 'New parent category not found' });
                        }
                        newParentCategory.children.addToSet(id);
                        await newParentCategory.save();
                    }
                }
            }
        }

        // Update category
        const category = await Category.findByIdAndUpdate(id, updates, { new: true });
        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        return res.status(200).send({ msg: 'Category updated successfully', data: category });
    } catch (error) {
        console.error('Error updating category:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Get All Categories with conditional fields
categoryRoute.get('/view', async (req, res) => {
    try {
        const { data } = req.query;

        let categories;
        if (data === 'all') {
            categories = await Category.aggregate([
                {
                    $lookup: {
                        from: 'Product',
                        localField: '_id',
                        foreignField: 'categoryID',
                        as: 'Product'
                    }
                },
                {
                    $project: {
                        name: 1,
                        image: 1,
                        slug: 1,
                        products: { $size: '$Product' }
                    }
                }
            ]);
        } else {
            categories = await Category.find().select('name');
        }

        return res.status(200).send(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Get All Categories with Pagination, Filtering, and Sorting
categoryRoute.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'asc' } = req.query;
        const pageNumber = parseInt(page, 10);
        const limitNumber = parseInt(limit, 10);

        if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber <= 0 || limitNumber <= 0) {
            return res.status(400).send({ msg: 'Invalid page or limit query parameters' });
        }

        const sortFields = ['createdAt', 'lastModified', 'name'];
        const sortDirections = ['asc', 'desc'];

        if (!sortFields.includes(sortBy) || !sortDirections.includes(sortOrder)) {
            return res.status(400).send({ msg: 'Invalid sortBy or sortOrder query parameters' });
        }

        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const searchFields = ['name', 'slug'];
        const searchConditions = [];

        // Handle ObjectId separately
        if (mongoose.Types.ObjectId.isValid(search)) {
            searchConditions.push({ _id: search });
        } else {
            searchFields.forEach(field => {
                if (search) {
                    const searchRegex = new RegExp(search, 'i');
                    searchConditions.push({ [field]: searchRegex });
                }
            });
        }

        const filter = searchConditions.length ? { $or: searchConditions } : {};

        const totalCount = await Category.countDocuments(filter);
        const totalPages = Math.ceil(totalCount / limitNumber);

        if (pageNumber > totalPages) {
            return res.status(400).send({ msg: 'Page number exceeds total pages available' });
        }

        const categories = await Category.find(filter)
            .sort(sort)
            .skip((pageNumber - 1) * limitNumber)
            .collation({ locale: 'en', strength: 2 })
            .limit(limitNumber)

        return res.status(200).send({
            msg: 'Success',
            data: categories,
            page: pageNumber,
            limit: limitNumber,
            totalPages,
            totalCount
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Get all categories in hierarchy
categoryRoute.get('/hierarchy', async (req, res) => {
    try {
        const categories = await Category.find().lean();

        // Creating a map to hold category data and child references
        const categoryMap = {};
        categories.forEach(category => {
            categoryMap[category._id] = { ...category, children: [] };
        });

        // Creating the hierarchy
        const rootCategories = [];
        categories.forEach(category => {
            if (category.parent) {
                if (categoryMap[category.parent]) {
                    categoryMap[category.parent].children.push(categoryMap[category._id]);
                }
            } else {
                rootCategories.push(categoryMap[category._id]);
            }
        });

        return res.status(200).send(rootCategories);
    } catch (error) {
        console.error('Error fetching category hierarchy:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Get Category Hierarchy names and id's
categoryRoute.get('/hierarchy-names', async (req, res) => {
    try {
        // Fetch categories with only _id and name fields
        const categories = await Category.find({}, '_id name parent slug').lean();

        // Creating a map to hold category data and child references
        const categoryMap = {};
        categories.forEach(category => {
            categoryMap[category._id] = {
                _id: category._id,
                name: category.name,
                slug: category.slug,
                children: []
            };
        });

        // Creating the hierarchy
        const rootCategories = [];
        categories.forEach(category => {
            if (category.parent) {
                if (categoryMap[category.parent]) {
                    categoryMap[category.parent].children.push(categoryMap[category._id]);
                }
            } else {
                rootCategories.push(categoryMap[category._id]);
            }
        });

        return res.status(200).send(rootCategories);
    } catch (error) {
        console.error('Error fetching category hierarchy:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Get Category by its id
categoryRoute.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let category = await Category.findById(id).populate('children');
        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }
        category = category.toObject();

        const products = await ProductModel.find({ categoryID: id }).lean();

        // Fetch exchange rate based on user's country and convert prices
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        if (req.query.currency && req.query.currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency: req.query.currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || req.query.currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Adjust product prices based on exchange rate
        products.forEach(product => {
            product.variants.forEach(variant => {
                const indianMRP = variant.price || 0;
                const indianSaleMRP = variant.salePrice || 0;
                const margin = variant.margin / 100 || 0.01;

                if (exchangeRate.rate !== 1) { // Not INR
                    const priceWithMargin = indianMRP * (1 + margin);
                    const salePriceWithMargin = indianSaleMRP * (1 + margin);
                    variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
                } else { // for INR
                    variant.price = Number(indianMRP.toFixed(2));
                    variant.salePrice = Number(indianSaleMRP.toFixed(2));
                }
                variant.currency = currencySymbol; // Set the currency symbol
            });
        });

        category.products = products;

        if (category.parent) {
            const parentData = await Category.findById(category.parent);
            if (!parentData) {
                return res.status(200).send(category);
            }
            category.parentName = parentData.name;
            category.parentSlug = parentData.slug;
            return res.status(200).send(category);
        }


        return res.status(200).send(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Get Category by its slug
categoryRoute.get('/slug/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        let category = await Category.findOne({ slug }).populate('children');
        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }
        category = category.toObject();

        const products = await ProductModel.find({ categoryID: category._id }).lean();

        // Fetch exchange rate based on user's country and convert prices
        let exchangeRate = { rate: 1 };
        let currencySymbol = "₹";

        if (req.query.currency && req.query.currency !== 'INR') {
            const foundExchangeRate = await ExchangeRate.findOne({ currency: req.query.currency });
            if (foundExchangeRate) {
                exchangeRate = foundExchangeRate;
                currencySymbol = exchangeRate.symbol || req.query.currency;
            } else {
                return res.status(400).send({ msg: 'Currency not supported' });
            }
        }

        // Adjust product prices based on exchange rate
        products.forEach(product => {
            product.variants.forEach(variant => {
                const indianMRP = variant.price || 0;
                const indianSaleMRP = variant.salePrice || 0;
                const margin = variant.margin / 100 || 0.01;

                if (exchangeRate.rate !== 1) { // Not INR
                    const priceWithMargin = indianMRP * (1 + margin);
                    const salePriceWithMargin = indianSaleMRP * (1 + margin);
                    variant.price = Number((priceWithMargin * exchangeRate.rate).toFixed(2));
                    variant.salePrice = Number((salePriceWithMargin * exchangeRate.rate).toFixed(2));
                } else { // for INR
                    variant.price = Number(indianMRP.toFixed(2));
                    variant.salePrice = Number(indianSaleMRP.toFixed(2));
                }
                variant.currency = currencySymbol; // Set the currency symbol
            });
        });

        category.products = products;

        if (category.parent) {
            const parentData = await Category.findById(category.parent);
            if (!parentData) {
                return res.status(200).send(category);
            }
            category.parentName = parentData.name;
            category.parentSlug = parentData.slug;
            return res.status(200).send(category);
        }
        return res.status(200).send(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Delete Category along with Image and Document
categoryRoute.delete('/:id', async (req, res) => {
    if (req.userDetail.role !== "admin") {
        return res.status(400).json({ msg: 'Access Denied' });
    }

    try {
        const { id } = req.params;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        // Delete Image if exists
        if (category.image) {
            await deleteFileFromS3(category.image);
        }

        // Delete Document if exists
        if (category.docFileURL) {
            await deleteFileFromS3(category.docFileURL);
        }

        // Remove category from parent's children list if it has a parent
        if (category.parent) {
            const parentCategory = await Category.findById(category.parent);
            if (parentCategory) {
                parentCategory.children.pull(category._id);
                await parentCategory.save();
            } else {
                console.warn(`Parent category with id ${category.parent} not found`);
            }
        }

        // Finally, delete the category itself
        await Category.findByIdAndDelete(id);

        return res.status(200).send({ msg: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


module.exports = categoryRoute;
















// const express = require('express');
// const multer = require('multer');
// const multerS3 = require('multer-s3');
// const path = require('path');
// const { body, validationResult } = require('express-validator');
// const mongoose = require('mongoose');

// const Category = require('../models/categoryModel');
// const verifyToken = require('../middlewares/auth');
// const categorySlugify = require('../utils/categorySlugify');
// const { s3Client, deleteFileFromS3, uploadFileToS3 } = require('../utils/categorys3Upload');


// const validateCategory = [
//     body('name').notEmpty().withMessage('Category name is required'),
//     body('description').optional().isString(),
//     body('parent').optional().isMongoId().withMessage('Parent must be a valid category ID')
// ];

// const categoryRoute = express.Router();

// const upload = multer({
//     storage: multerS3({
//         s3: s3Client,
//         bucket: process.env.AWS_BUCKET_NAME,
//         acl: 'public-read',
//         metadata: (req, file, cb) => {
//             cb(null, { fieldName: file.fieldname });
//         },
//         key: (req, file, cb) => {
//             cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
//         }
//     }),
//     limits: { fileSize: 1000 * 1024 * 1024 }, // 1GB limit
//     fileFilter: (req, file, cb) => {
//         const filetypes = /jpeg|jpg|png|pdf|webp|doc|docx/;
//         const mimetype = filetypes.test(file.mimetype);
//         const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
//         if (mimetype && extname) {
//             return cb(null, true);
//         }
//         cb('Error: File upload only supports the following filetypes - ' + filetypes);
//     }
// });


// // Add Category
// categoryRoute.post('/', validateCategory, verifyToken, async (req, res) => {
//     if (req.userDetail.role !== "admin") {
//         return res.status(400).send({ msg: 'Access Denied' });
//     }

//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//         return res.status(400).json({ errors: errors.array() });
//     }

//     try {
//         const { name, description, parent } = req.body;
//         const slug = await categorySlugify(name);
//         const category = new Category({ name, description, slug, parent });

//         if (parent) {
//             const parentCategory = await Category.findById(parent);
//             if (!parentCategory) {
//                 return res.status(404).send({ msg: 'Parent category not found' });
//             }

//             parentCategory.children.push(category._id);
//             await parentCategory.save();
//         }

//         await category.save();
//         res.status(201).send({ msg: 'Category created successfully', data: category });
//     } catch (error) {
//         console.error('Error creating category:', error);
//         res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Add/Update Image to Category
// categoryRoute.patch('/:id/image', verifyToken, upload.single('image'), async (req, res) => {
//     if (req.userDetail.role !== "admin") {
//         return res.status(400).send({ msg: 'Access Denied' });
//     }

//     try {
//         const { id } = req.params;

//         // Validate if an image is provided
//         if (!req.file) {
//             return res.status(400).json({ msg: 'Image is required' });
//         }

//         // Find the category by ID
//         const category = await Category.findById(id);
//         if (!category) {
//             return res.status(404).json({ msg: 'Category not found' });
//         }

//         const fileName = `Category-Image-${id}-${Date.now()}`;

//         // Delete the existing image from AWS S3 if it exists
//         if (category.image) {
//             await deleteFileFromS3(category.image);
//         }
//         console.log("1",req.file.buffer, "2",req.file.mimetype, "3",fileName)

//         // Upload the new image to AWS S3
//         const imageUrl = await uploadFileToS3(req.file.buffer, req.file.mimetype, fileName);

//         // Update the category's image field in MongoDB
//         category.image = imageUrl;
//         await category.save();

//         res.status(200).send({ msg: 'Category image updated successfully', data: category });
//     } catch (error) {
//         console.error('Error updating category image:', error);
//         res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });



// // Delete Image from Category
// categoryRoute.delete('/:id/image', verifyToken, async (req, res) => {
//     if (req.userDetail.role !== "admin") {
//         return res.status(400).send({ msg: 'Access Denied' });
//     }

//     try {
//         const { id } = req.params;
//         const category = await Category.findById(id);

//         if (!category) {
//             return res.status(404).send({ msg: 'Category not found' });
//         }

//         if (category.image) {
//             await deleteFileFromS3(category.image);
//             category.image = '';
//             await category.save();
//             return res.status(200).send({ msg: 'Category image deleted successfully', data: category });
//         } else {
//             return res.status(404).send({ msg: 'No image found for this category' });
//         }
//     } catch (error) {
//         console.error('Error deleting category image:', error);
//         res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Add/Update Document to Category
// categoryRoute.patch('/:id/docFile', verifyToken, upload.single('file'), async (req, res) => {
//     if (req.userDetail.role !== "admin") {
//         return res.status(400).send({ msg: 'Access Denied' });
//     }

//     try {
//         const { id } = req.params;
//         const category = await Category.findById(id);

//         if (!category) {
//             return res.status(404).send({ msg: 'Category not found' });
//         }

//         if (!req.file) {
//             return res.status(400).send({ msg: 'Document file is required' });
//         }

//         if (category.docFileURL) {
//             const docFileKey = category.docFileURL.split('/').pop();
//             const deleteParams = {
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: docFileKey
//             };
//             await s3Client.send(new DeleteObjectCommand(deleteParams));
//         }

//         const fileName = `Category-File-${id}-${Date.now()}`;
//         const params = {
//             Bucket: process.env.AWS_BUCKET_NAME,
//             Key: fileName,
//             Body: req.file.buffer,
//             ContentType: req.file.mimetype
//         };

//         const uploadCommand = new PutObjectCommand(params);
//         await s3Client.send(uploadCommand);

//         const docFileURL = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
//         category.docFileURL = docFileURL;
//         await category.save();

//         return res.status(200).send({ msg: 'Category document updated successfully', data: category });
//     } catch (error) {
//         console.error('Error updating category document:', error);
//         return res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Delete Document from Category
// categoryRoute.delete('/:id/docFile', verifyToken, async (req, res) => {
//     if (req.userDetail.role !== "admin") {
//         return res.status(400).send({ msg: 'Access Denied' });
//     }

//     try {
//         const { id } = req.params;
//         const category = await Category.findById(id);

//         if (!category) {
//             return res.status(404).send({ msg: 'Category not found' });
//         }

//         if (category.docFileURL) {
//             const docFileKey = category.docFileURL.split('/').pop();
//             const deleteParams = {
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: docFileKey
//             };
//             await s3Client.send(new DeleteObjectCommand(deleteParams));

//             category.docFileURL = '';
//             await category.save();
//         } else {
//             return res.status(404).send({ msg: 'No document found for this category' });
//         }

//         return res.status(200).send({ msg: 'Category document deleted successfully', data: category });
//     } catch (error) {
//         console.error('Error deleting category document:', error);
//         return res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Update Category (excluding image and docFileURL)
// categoryRoute.patch('/:id', validateCategory, verifyToken, async (req, res) => {
//     if (req.userDetail.role !== "admin") {
//         return res.status(400).send({ msg: 'Access Denied' });
//     }

//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//         return res.status(400).json({ errors: errors.array() });
//     }

//     try {
//         const { id } = req.params;
//         const updates = req.body;

//         if (updates.parent) {
//             const parentCategory = await Category.findById(updates.parent);
//             if (!parentCategory) {
//                 return res.status(404).send({ msg: 'Parent category not found' });
//             }
//         }

//         delete updates._id;
//         delete updates.slug;
//         delete updates.__v;
//         delete updates.image;
//         delete updates.docFile;
//         delete updates.children;
//         delete updates.createdAt;
//         updates.lastModified = Date.now();

//         const category = await Category.findByIdAndUpdate(id, updates, { new: true });
//         if (!category) {
//             return res.status(404).send({ msg: 'Category not found' });
//         }

//         return res.status(200).send({ msg: 'Category updated successfully', data: category });
//     } catch (error) {
//         console.error('Error updating category:', error);
//         return res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Get All Categories
// categoryRoute.get('/', async (req, res) => {
//     try {
//         const categories = await Category.find();
//         return res.status(200).send(categories);
//     } catch (error) {
//         console.error('Error fetching categories:', error);
//         return res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Get Category Hierarchy
// categoryRoute.get('/hierarchy', async (req, res) => {
//     try {
//         const categories = await Category.find().lean();

//         const categoryMap = {};
//         categories.forEach(category => {
//             categoryMap[category._id] = { ...category, children: [] };
//         });

//         const rootCategories = [];
//         categories.forEach(category => {
//             if (category.parent) {
//                 if (categoryMap[category.parent]) {
//                     categoryMap[category.parent].children.push(categoryMap[category._id]);
//                 }
//             } else {
//                 rootCategories.push(categoryMap[category._id]);
//             }
//         });

//         return res.status(200).send(rootCategories);
//     } catch (error) {
//         console.error('Error fetching category hierarchy:', error);
//         return res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Get Category and its hierarchy
// categoryRoute.get('/:id', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const category = await Category.findById(id).populate('children');
//         if (!category) {
//             return res.status(404).send({ msg: 'Category not found' });
//         }
//         return res.status(200).send({ category });
//     } catch (error) {
//         console.error('Error fetching category:', error);
//         return res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// // Delete Category
// categoryRoute.delete('/:id', verifyToken, async (req, res) => {
//     if (req.userDetail.role !== "admin") {
//         return res.status(400).send({ msg: 'Access Denied' });
//     }

//     try {
//         const { id } = req.params;

//         const category = await Category.findById(id);
//         if (!category) {
//             return res.status(404).send({ msg: 'Category not found' });
//         }

//         // Delete image from S3 if exists
//         if (category.image) {
//             const imageKey = category.image.split('/').pop();
//             const deleteImageParams = {
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: imageKey
//             };
//             await s3Client.send(new DeleteObjectCommand(deleteImageParams));
//         }

//         // Delete document from S3 if exists
//         if (category.docFileURL) {
//             const docFileKey = category.docFileURL.split('/').pop();
//             const deleteDocFileParams = {
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: docFileKey
//             };
//             await s3Client.send(new DeleteObjectCommand(deleteDocFileParams));
//         }

//         if (category.parent) {
//             const parentCategory = await Category.findById(category.parent);
//             if (parentCategory) {
//                 parentCategory.children.pull(category._id);
//                 await parentCategory.save();
//             } else {
//                 console.warn(`Parent category with id ${category.parent} not found`);
//             }
//         }

//         await Category.findByIdAndDelete(id);

//         const categories = await Category.find().lean();

//         const categoryMap = {};
//         categories.forEach(category => {
//             categoryMap[category._id] = { ...category, children: [] };
//         });

//         const rootCategories = [];
//         categories.forEach(category => {
//             if (category.parent) {
//                 if (categoryMap[category.parent]) {
//                     categoryMap[category.parent].children.push(categoryMap[category._id]);
//                 }
//             } else {
//                 rootCategories.push(categoryMap[category._id]);
//             }
//         });

//         return res.status(200).send({ msg: 'Category deleted successfully', data: rootCategories });
//     } catch (error) {
//         console.error('Error deleting category:', error);
//         return res.status(500).send({ msg: 'Internal server error, try again later' });
//     }
// });


// module.exports = categoryRoute;