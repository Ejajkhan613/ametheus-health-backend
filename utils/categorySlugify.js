// utils/categorySlugify.js
const slugify = require('slugify');
const CategoryModel = require('../models/categoryModel');

async function createSlug(text) {
    let slug = slugify(text, { lower: true, strict: true });
    let uniqueSlug = slug;
    let count = 0;

    while (await CategoryModel.findOne({ slug: uniqueSlug })) {
        count++;
        uniqueSlug = `${slug}-${count}`;
    }

    return uniqueSlug;
}

module.exports = createSlug;
