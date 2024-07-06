const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Category = require('../models/categoryModel');
const categorySlugify = require('../utils/categorySlugify');

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, description, parent } = req.body;
        const slug = await categorySlugify(name);
        console.log(slug);
        const category = new Category({ name, description, slug, parent });

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
    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        if (category.image) {
            await deleteFileFromS3(category.image);
            category.image = undefined;
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
    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        if (category.docFileURL) {
            await deleteFileFromS3(category.docFileURL);
            category.docFileURL = undefined;
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
    body('parent').optional().isMongoId().withMessage('Parent must be a valid category ID')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.parent) {
            const parentCategory = await Category.findById(updates.parent);
            if (!parentCategory) {
                return res.status(404).send({ msg: 'Parent category not found' });
            }
        }

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

// Get All Categories
categoryRoute.get('/', async (req, res) => {
    try {
        const categories = await Category.find();
        return res.status(200).send(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

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

// Get Category and its hierarchy
categoryRoute.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id).populate('children');
        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }
        return res.status(200).send({ category });
    } catch (error) {
        console.error('Error fetching category:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Delete Category
categoryRoute.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }

        if (category.parent) {
            const parentCategory = await Category.findById(category.parent);
            if (parentCategory) {
                parentCategory.children.pull(category._id);
                await parentCategory.save();
            } else {
                console.warn(`Parent category with id ${category.parent} not found`);
            }
        }

        await Category.findByIdAndDelete(id);

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

        return res.status(200).send({ msg: 'Category deleted successfully', data: rootCategories });
    } catch (error) {
        console.error('Error deleting category:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


module.exports = categoryRoute;