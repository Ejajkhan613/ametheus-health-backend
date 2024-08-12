// models/userModel.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    mobile: {
        type: String,
        default: ""
    },
    name: {
        type: String,
        default: ""
    },
    gender: {
        type: String,
        default: ""
    },
    uhid: {
        type: String,
        required: true,
        unique: true
    },
    dateOfBirth: {
        type: Date,
        default: ""
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        default: ""
    },
    referralCode: {
        type: String,
        default: ""
    },
    role: {
        type: String,
        enum: ["customer", "admin"],
        default: "customer"
    },
    googleId: {
        type: String
    },
    authMethod: {
        type: String,
        default: 'simple'
    }
});

const UserModel = mongoose.model('User', userSchema);

module.exports = UserModel;