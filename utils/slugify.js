// utils/slugify.js
const slugify = require('slugify');
const ProductModel = require('../models/productModel');

async function createSlug(text) {
    let slug = slugify(text, { lower: true, strict: true });
    let uniqueSlug = slug;
    let count = 0;

    while (await ProductModel.findOne({ slug: uniqueSlug })) {
        count++;
        uniqueSlug = `${slug}-${count}`;
    }

    return uniqueSlug;
}

module.exports = createSlug;
