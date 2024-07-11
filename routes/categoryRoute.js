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
        let category = await Category.findById(id).populate('children');
        category = category.toObject();
        if (!category) {
            return res.status(404).send({ msg: 'Category not found' });
        }
        if (category.parent) {
            const parentData = await Category.findById(category.parent);
            if(!parentData){
                return res.status(200).send({ msg: 'Success', category });
            }
            category.parentName = parentData.name;
            category.parentSlug = parentData.slug;
            console.log("DATA",category.parentName);
            console.log("DATA",category.parentSlug);
            return res.status(200).send({ msg: 'Success', category });
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