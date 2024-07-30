// routes/userRoute.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { body, validationResult } = require('express-validator');


const multer = require('multer');
const s3 = require('../config/s3');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


const verifyToken = require('../middlewares/auth');

const generateOTP = require('../utils/otpGenerator');
const sendOtp = require('../utils/sendOtp');
const generateUHID = require('../utils/uhidGenerator');

const OTPModel = require('../models/otpModel');
const UserModel = require('../models/userModel');
const FamilyMemberModel = require('../models/familyModel');

const userRouter = express.Router();


// Rate limiter
const Limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: "Too many request attempts, please try after 10 minutes."
});


// Get User Account Details
userRouter.get('/', verifyToken, async (req, res) => {
    try {
        const { password, role, __v, referralCode, ...userData } = req.userDetail.toObject();

        return res.status(200).send({ msg: 'Success', data: userData });
    } catch (error) {
        console.error('Error fetching user details:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later' });
    }
});

// Get Admin Account Details
userRouter.get('/admin', verifyToken, async (req, res) => {
    try {
        const { password, role, __v, referralCode, ...userData } = req.userDetail.toObject();
        console.log()
        if (req.userDetail.role !== "admin") {
            return res.status(400).send({ "msg": "Access Denied" });
        } else {
            return res.status(200).send({ msg: 'Success', data: userData });
        }
    } catch (error) {
        console.error('Error fetching user details:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later' });
    }
});


const validateRegistration = [
    body('email')
        .isEmail().withMessage('Invalid Email ID')
        .customSanitizer(email => validator.normalizeEmail(email))
        .custom(async (email) => {
            const existingUser = await UserModel.findOne({ email });
            if (existingUser) {
                throw new Error('Email is already registered');
            }
            return true;
        }),
    body('name').isString().notEmpty().withMessage('Name is required').trim(),
    body('password')
        .isString().withMessage('Password must be a string')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one symbol'),
];

// Register and Send OTP
userRouter.post('/register', Limiter, validateRegistration, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, name, password } = req.body;
        const hashedPass = await bcrypt.hash(password, 11);
        const otp = generateOTP();

        const sendingEmail = await sendOtp(email, otp);
        if (!sendingEmail.status) {
            return res.status(500).send({ msg: 'Email OTP Sending Failed, Try Again Later' });
        }

        const filter = { email };
        const update = { email, name, type: 'REGISTER', password: hashedPass, otp };

        await OTPModel.findOneAndUpdate(filter, update, {
            upsert: true,
            new: true
        });

        return res.status(200).send({ msg: 'OTP Sent' });
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later' });
    }
});


// Verify Route Validation
const validateOtp = [
    body('email')
        .isEmail().withMessage('Invalid Email ID')
        .customSanitizer(email => validator.normalizeEmail(email)),
    body('otp').isString().notEmpty().withMessage('OTP is required')
];

// Verify User Account
userRouter.post('/verify', Limiter, validateOtp, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, otp } = req.body;

        const checkEmail = await OTPModel.findOne({ email, otp, type: 'REGISTER' });
        if (!checkEmail) {
            return res.status(404).send({ msg: 'OTP Invalid or Expired' });
        }

        const checkAccount = await UserModel.findOne({ email });
        if (checkAccount) {
            return res.status(400).send({ msg: 'Email is already registered' });
        }

        const uhid = await generateUHID();

        const newUser = new UserModel({
            email,
            name: checkEmail.name,
            password: checkEmail.password,
            role: 'customer',
            uhid,
            referralCode: uhid
        });

        await newUser.save();
        const userID = newUser._id;
        const token = jwt.sign({ userID }, process.env.SECRET_KEY, { expiresIn: '15d' });

        const cookieOptions = {
            maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Ensure cookies are sent only over HTTPS in production
            sameSite: 'Strict'
        };

        res.cookie('x_auth_token', token, cookieOptions);
        res.cookie('x_userid', userID, cookieOptions);
        res.cookie('x_user', checkEmail.name, cookieOptions);

        await OTPModel.findByIdAndDelete(checkEmail._id);

        return res.status(201).send({ msg: 'Account Created Successfully', x_auth_token: token, x_userid: userID, x_user: checkEmail.name });
    } catch (error) {
        console.error('Verification error:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later' });
    }
});


// Login Route Validation
const validateLogin = [
    body('email').isEmail().withMessage('Invalid email format'),
    body('password').notEmpty().withMessage('Password is required')
];

// Login User Account
userRouter.post('/login', Limiter, validateLogin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, password } = req.body;

        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).send({ msg: 'Wrong credentials provided' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).send({ msg: 'Wrong credentials provided' });
        }

        const userID = user._id;
        const token = jwt.sign({ userID }, process.env.SECRET_KEY, { expiresIn: '15d' });

        const cookieOptions = {
            maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Ensure cookies are sent only over HTTPS in production
            sameSite: 'Strict'
        };

        res.cookie('x_auth_token', token, cookieOptions);
        res.cookie('x_userid', userID, cookieOptions);
        res.cookie('x_user', user.name, cookieOptions);

        return res.status(200).send({ msg: 'Login successful', x_auth_token: token, x_userid: userID, x_user: user.name });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// User Details Update Route Validation
const userValidation = [
    body('name').optional().isString().withMessage('Name must be a string'),
    body('gender').optional().isString().withMessage('Gender must be a string'),
    body('mobile').optional().isString().withMessage('Mobile must be a string')
];

// User Account Details Update
userRouter.patch('/', Limiter, userValidation, verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const userId = req.userDetail._id;
        const { name, gender, dateOfBirth = "", mobile } = req.body;
        console.log(dateOfBirth);

        // Find the user by ID
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).send({ msg: 'User not found' });
        }

        // Check if the user is authorized to update the details
        if (user._id.toString() !== req.userDetail._id.toString() && req.userDetail.role !== 'admin') {
            return res.status(403).send({ msg: 'Access denied' });
        }

        // Update user details
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (gender !== undefined) updateData.gender = gender;
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
        if (mobile !== undefined) updateData.mobile = mobile;

        const updatedUser = await UserModel.findByIdAndUpdate(userId, updateData, { new: true });

        // Convert Mongoose document to plain JavaScript object
        const updatedUserData = updatedUser.toObject();

        // Remove sensitive data
        delete updatedUserData.password;
        delete updatedUserData.role;
        delete updatedUserData.__v;
        delete updatedUserData.referralCode;

        return res.status(200).send({ msg: 'User details updated successfully', data: updatedUserData });
    } catch (error) {
        console.error('Update error:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later', error });
    }
});


// Update User Avatar
userRouter.patch('/avatar', Limiter, verifyToken, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.userDetail._id;

        if (!req.file) {
            return res.status(400).json({ msg: 'Avatar image is required' });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const fileName = `Avatar-${userId}-${Date.now()}`;
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read' // Optional: If you want the uploaded file to be publicly accessible
        };

        const uploadCommand = new PutObjectCommand(params);
        await s3.send(uploadCommand);

        const avatarUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;


        if (user.avatar) {
            const avatarKey = user.avatar.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: avatarKey
            };
            const deleteCommand = new DeleteObjectCommand(deleteParams);
            await s3.send(deleteCommand);
        }

        user.avatar = avatarUrl;
        await user.save();

        const updatedUser = user.toObject();
        delete updatedUser.password;
        delete updatedUser.role;
        delete updatedUser.__v;

        return res.status(200).send({ msg: 'Avatar updated successfully', data: updatedUser });
    } catch (error) {
        console.error('Error updating avatar:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Delete User Avatar
userRouter.delete('/avatar', Limiter, verifyToken, async (req, res) => {
    try {
        const userId = req.userDetail._id;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        if (user.avatar) {
            const avatarKey = user.avatar.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: avatarKey
            };
            const deleteCommand = new DeleteObjectCommand(deleteParams);
            await s3.send(deleteCommand);
        }

        user.avatar = '';
        await user.save();

        const updatedUser = user.toObject();
        delete updatedUser.password;
        delete updatedUser.role;
        delete updatedUser.__v;

        return res.status(200).send({ msg: 'Avatar deleted successfully', data: updatedUser });
    } catch (error) {
        console.error('Error deleting avatar:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Validation middleware for changing password
const passwordValidation = [
    body('oldPassword').notEmpty().isString().withMessage('Old password is required'),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isString().withMessage('New password must be a string')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
        .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('New password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('New password must contain at least one number')
        .matches(/[^A-Za-z0-9]/).withMessage('New password must contain at least one symbol')
];

// Change User Account Password
userRouter.patch('/change-password', Limiter, passwordValidation, verifyToken, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const userId = req.userDetail._id;
        const { oldPassword, newPassword } = req.body;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).send({ msg: 'User not found' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).send({ msg: 'Old password is incorrect' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 11);
        user.password = hashedNewPassword;
        await user.save();

        // Generate new JWT token
        const token = jwt.sign({ userID: user._id }, process.env.SECRET_KEY, { expiresIn: '15d' });

        // Set cookies with new JWT token
        const cookieOptions = {
            maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days in milliseconds
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Ensure cookies are sent only over HTTPS in production
            sameSite: 'Strict'
        };

        res.cookie('x_auth_token', token, cookieOptions);
        res.cookie('x_userid', user._id, cookieOptions);
        res.cookie('x_user', user.name, cookieOptions);

        return res.status(200).send({ msg: 'Password changed successfully', x_auth_token: token, x_userid: user._id, x_user: user.name });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later', error });
    }
});


// Generate and send OTP for forget password
userRouter.post('/send-forget-pass-otp', Limiter, async (req, res) => {
    const { email } = req.body;

    try {
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(404).send({ msg: 'User not found' });
        }

        const otp = generateOTP(); // Function to generate OTP
        const sendingEmail = await sendOtp(email, otp); // Function to send OTP via email

        if (!sendingEmail.status) {
            return res.status(400).send({ msg: 'Email OTP Sending Failed, Try Again Later' });
        }

        const filter = { email };
        const update = { email, type: 'FORGETPASSWORD', otp };

        const data = await OTPModel.findOneAndUpdate(filter, update, {
            upsert: true,
            new: true
        });

        return res.status(200).send({ msg: 'OTP Sent' });
    } catch (error) {
        console.error('Error sending OTP:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later', error });
    }
});


// Validation middleware for changing password with OTP
const changePasswordWithOTPValidation = [
    body('email').isEmail().withMessage('Email must be valid'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
    body('newPassword').isLength({ min: 6 }).withMessage('New Password must be at least 6 characters long')
];

// Change User Password using OTP
userRouter.patch('/change-password-with-otp', Limiter, changePasswordWithOTPValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, otp, newPassword } = req.body;

        // Verify OTP
        const otpRecord = await OTPModel.findOne({ email, otp, type: 'FORGETPASSWORD' });
        if (!otpRecord) {
            return res.status(400).send({ msg: 'Invalid or expired OTP' });
        }

        // Find user and update password
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(404).send({ msg: 'User not found' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 11);
        user.password = hashedNewPassword;
        await user.save();

        // Delete OTP record
        await OTPModel.deleteOne({ _id: otpRecord._id });

        // Generate new JWT token
        const token = jwt.sign({ userID: user._id }, process.env.SECRET_KEY, { expiresIn: '15d' });

        // Set cookies with new JWT token
        const cookieOptions = {
            maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days in milliseconds
            httpOnly: true,
            secure: true, // Ensure cookies are sent only over HTTPS
            sameSite: 'Strict'
        };

        res.cookie('x_auth_token', token, cookieOptions);
        res.cookie('x_userid', user._id, cookieOptions);
        res.cookie('x_user', user.name, cookieOptions);

        return res.status(200).send({ msg: 'Password changed successfully', x_auth_token: token, x_userid: user._id, x_user: user.name });
    } catch (error) {
        console.error('Error changing password:', error);
        return res.status(500).send({ msg: 'Internal Server Error, Try Again Later', error });
    }
});


// Validation middleware for adding family member
const familyValidation = [
    body('name').notEmpty().isString().withMessage('Name is required').trim(),
    body('relation').notEmpty().isString().isIn([
        'GRANDMOTHER', 'GRANDFATHER', 'MOTHER', 'FATHER', 'SISTER', 'BROTHER',
        'COUSIN', 'DAUGHTER', 'SON', 'GRANDDAUGHTER', 'GRANDSON', 'WIFE',
        'HUSBAND', 'OTHER'
    ]).withMessage('Relation is required and must be a valid relation'),
    body('dateOfBirth').notEmpty().isISO8601().toDate().withMessage('Date of birth is required and must be a valid date'),
    body('otherRelation').optional().isString().withMessage('Other relation must be a string').trim(),
    body('gender').optional().isString().isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other')
];

// Add Family Member (without avatar)
userRouter.post('/family', familyValidation, verifyToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.userDetail._id;
        let { name, relation, dateOfBirth, otherRelation, gender } = req.body;

        // Determine gender if not specified for specific relations
        if (relation !== 'OTHER') {
            if (['FATHER', 'GRANDFATHER', 'BROTHER', 'SON', 'GRANDSON', 'HUSBAND'].includes(relation)) {
                gender = 'Male';
            } else if (['MOTHER', 'GRANDMOTHER', 'SISTER', 'DAUGHTER', 'GRANDDAUGHTER', 'WIFE'].includes(relation)) {
                gender = 'Female';
            } else {
                gender = 'Other';
            }
        } else {
            if (!gender) {
                return res.status(400).json({ errors: [{ msg: 'Gender is required when relation is OTHER' }] });
            }
            if (!otherRelation) {
                return res.status(400).json({ msg: 'Other relation is required when relation is OTHER' });
            }
        }

        const familyMember = new FamilyMemberModel({
            user: userId,
            name,
            gender,
            relation,
            otherRelation: relation === 'OTHER' ? otherRelation : '',
            dateOfBirth
        });

        await familyMember.save();

        const memberDetail = familyMember.toObject();
        delete memberDetail.__v;
        delete memberDetail.user;

        return res.status(201).json({ msg: 'Family member added successfully', data: memberDetail });
    } catch (error) {
        console.error('Error adding family member:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});


// Validation middleware for updating family member
const editFamilyValidation = [
    body('name').optional().isString().withMessage('Name must be a string').trim(),
    body('gender').optional().isString().isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
    body('dateOfBirth').optional().isISO8601().toDate().withMessage('Date of birth must be a valid date')
];

// Edit Family Member
userRouter.patch('/family/:id', editFamilyValidation, verifyToken, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.userDetail._id;
        const familyMemberId = req.params.id;
        const updates = req.body;

        // Validate updates to prevent unexpected modifications
        const allowedUpdates = ['name', 'gender', 'dateOfBirth', 'relation', 'otherRelation'];
        const isValidOperation = Object.keys(updates).every(update => allowedUpdates.includes(update));

        if (!isValidOperation) {
            return res.status(400).send({ msg: 'Invalid updates!' });
        }

        // Check and adjust gender and otherRelation based on relation
        if (updates.relation !== 'OTHER') {
            updates.otherRelation = '';
            if (['FATHER', 'GRANDFATHER', 'BROTHER', 'SON', 'GRANDSON', 'HUSBAND'].includes(updates.relation)) {
                updates.gender = 'Male';
            } else if (['MOTHER', 'GRANDMOTHER', 'SISTER', 'DAUGHTER', 'GRANDDAUGHTER', 'WIFE'].includes(updates.relation)) {
                updates.gender = 'Female';
            } else {
                updates.gender = 'Other';
            }
        } else {
            if (!updates.gender) {
                return res.status(400).json({ errors: [{ msg: 'Gender is required when relation is OTHER' }] });
            }
            if (!updates.otherRelation) {
                return res.status(400).json({ msg: 'Other relation is required when relation is OTHER' });
            }
        }

        const familyMemberDetails = await FamilyMemberModel.findOneAndUpdate(
            { _id: familyMemberId, user: userId },
            updates,
            { new: true }
        );

        if (!familyMemberDetails) {
            return res.status(404).send({ msg: 'Family member not found or unauthorized' });
        }

        const memberDetail = familyMemberDetails.toObject();
        delete memberDetail.__v;
        delete memberDetail.user;

        return res.status(200).send({ msg: 'Family member updated successfully', data: memberDetail });
    } catch (error) {
        console.error('Error updating family member:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Fetch All Family Members
userRouter.get('/family', verifyToken, async (req, res) => {
    try {
        const userId = req.userDetail._id;

        // Fetch family members belonging to the authenticated user
        const familyMembers = await FamilyMemberModel.find({ user: userId }).select('-__v -user');

        if (!familyMembers || familyMembers.length === 0) {
            return res.status(200).send({ msg: 'Success', data: [] });
        }

        return res.status(200).send({ msg: 'Success', data: familyMembers });
    } catch (error) {
        console.error('Error fetching family members:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Fetch Family Member by ID
userRouter.get('/family/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userDetail._id;

        // Find the family member by ID and ensure it belongs to the current user
        const familyMember = await FamilyMemberModel.findOne({ _id: id, user: userId }).select('-__v -user');

        if (!familyMember) {
            return res.status(404).send({ msg: 'Family member not found' });
        }

        return res.status(200).send({ msg: 'Success', data: familyMember });
    } catch (error) {
        console.error('Error fetching family member:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Delete Family Member
userRouter.delete('/family/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.userDetail._id;
        const familyMemberId = req.params.id;

        // Check if the family member exists and belongs to the authenticated user
        const familyMemberDetails = await FamilyMemberModel.findById(familyMemberId);

        if (!familyMemberDetails) {
            return res.status(404).json({ msg: 'Family member not found' });
        }

        // Ensure the authenticated user owns the family member before deletion
        if (familyMemberDetails.user.toString() !== userId.toString()) {
            return res.status(403).json({ msg: 'Unauthorized to delete this family member' });
        }

        // Delete the family member's avatar from AWS S3 if it exists
        if (familyMemberDetails.avatar) {
            const avatarKey = familyMemberDetails.avatar.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: avatarKey
            };
            const deleteCommand = new DeleteObjectCommand(deleteParams);
            await s3.send(deleteCommand);
        }

        // Delete the family member from MongoDB
        const deletedFamilyMember = await FamilyMemberModel.findByIdAndDelete(familyMemberId);

        if (!deletedFamilyMember) {
            return res.status(404).json({ msg: 'Family member not found or unauthorized' });
        }

        return res.status(200).json({ msg: 'Family member deleted successfully' });
    } catch (error) {
        console.error('Error deleting family member:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});


// Update Family Member's Avatar
userRouter.patch('/family/:id/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.userDetail._id;
        const familyMemberId = req.params.id;

        // Validate if an avatar image is provided
        if (!req.file) {
            return res.status(400).json({ msg: 'Avatar image is required' });
        }

        const fileName = `Avatar-Family-Member-${familyMemberId}-User-${userId}-${Date.now()}`;
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };

        // Find the family member by ID
        const familyMemberDetails = await FamilyMemberModel.findById(familyMemberId);
        if (!familyMemberDetails) {
            return res.status(404).json({ msg: 'Family member not found' });
        }

        // Ensure the authenticated user owns the family member before deletion
        if (familyMemberDetails.user.toString() !== userId.toString()) {
            return res.status(403).json({ msg: 'Unauthorized to update this family member avatar' });
        }

        // Delete the existing avatar from AWS S3 if it exists
        if (familyMemberDetails.avatar) {
            const avatarKey = familyMemberDetails.avatar.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: avatarKey
            };
            const deleteCommand = new DeleteObjectCommand(deleteParams);
            await s3.send(deleteCommand);
        }

        // Upload the new avatar to AWS S3
        const uploadCommand = new PutObjectCommand(params);
        await s3.send(uploadCommand);

        // Construct the avatar URL
        const avatarUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

        // Update the family member's avatar field in MongoDB
        familyMemberDetails.avatar = avatarUrl;
        await familyMemberDetails.save();

        return res.status(200).send({ msg: 'Avatar updated successfully', data: familyMemberDetails });
    } catch (error) {
        console.error('Error updating avatar:', error);
        return res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});


// Delete Family Member's Avatar
userRouter.delete('/family/:id/avatar', verifyToken, async (req, res) => {
    try {
        const userId = req.userDetail._id;
        const familyMemberId = req.params.id;

        // Find the family member by ID
        const familyMemberDetails = await FamilyMemberModel.findById(familyMemberId);
        if (!familyMemberDetails) {
            return res.status(404).json({ msg: 'Family member not found' });
        }

        // Ensure the authenticated user owns the family member before deletion
        if (familyMemberDetails.user.toString() !== userId.toString()) {
            return res.status(403).json({ msg: 'Unauthorized to delete this family member avatar' });
        }

        // Check if the family member has an avatar
        if (!familyMemberDetails.avatar) {
            return res.status(400).json({ msg: 'Family member does not have an avatar' });
        }

        // Extract the avatar key from the avatar URL
        const avatarKey = familyMemberDetails.avatar.split('/').pop();

        // Delete the avatar from AWS S3
        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: avatarKey
        };
        const deleteCommand = new DeleteObjectCommand(deleteParams);
        await s3.send(deleteCommand);

        // Update the family member's avatar field in MongoDB
        familyMemberDetails.avatar = '';
        await familyMemberDetails.save();

        return res.status(200).json({ msg: 'Avatar deleted successfully', data: familyMemberDetails });
    } catch (error) {
        console.error('Error deleting avatar:', error);
        return res.status(500).json({ msg: 'Internal server error, try again later' });
    }
});


module.exports = userRouter;