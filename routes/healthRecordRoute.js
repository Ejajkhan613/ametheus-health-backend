// routes/healthRecordRoute.js
const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const convertToPDF = require('../utils/fileConversion');
const { uploadToS3, deleteFromS3, generateSignedUrl, generateKey } = require('../utils/s3Upload');

const HealthRecord = require('../models/healthRecordModel');
const User = require('../models/userModel');
const FamilyMemberModel = require('../models/familyModel');
const verifyToken = require('../middlewares/auth');

const upload = multer({ dest: 'uploads/' });
const healthRecordRouter = express.Router();

// Custom validation logic based on type of record
const customValidation = (value, { req }) => {
    const { typeOfRecord, testName, labName, prescribedBy, billNumber, hospitalName, idNumber, recordFrom, insuranceAmount } = req.body;

    switch (typeOfRecord) {
        case 'Lab Reports':
            if (!testName) throw new Error('Test name is required for lab reports');
            if (!labName) throw new Error('Lab name is required for lab reports');
            break;
        case 'Prescription':
            if (!prescribedBy) throw new Error('Prescribed by is required for prescription');
            break;
        case 'Hospitalization':
            if (!recordFrom) throw new Error('Record from is required for hospitalization');
            break;
        case 'Bill':
            if (!billNumber) throw new Error('Bill number is required for bill');
            if (!hospitalName) throw new Error('Hospital name is required for bill');
            break;
        case 'Insurance':
            if (!idNumber) throw new Error('ID number is required for insurance');
            if (!insuranceAmount) throw new Error('Insurance amount is required for insurance');
            break;
    }
    return true;
};

// Upload Health Record
healthRecordRouter.post('/', verifyToken, upload.single('file'), [
    body('title').notEmpty().withMessage('Title is required'),
    body('typeOfRecord').notEmpty().withMessage('Type of record is required'),
    body('testName').optional().isString(),
    body('recordGeneratedDate').optional().isISO8601().toDate(),
    body('recordDoctorName').optional().isString(),
    body('additionalNotes').optional().isString(),
    body('patientId').optional().isMongoId().withMessage('Patient ID must be a valid ID'),
    body('typeOfRecord').custom(customValidation)
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { title, typeOfRecord, testName, fileName, recordGeneratedDate, recordDoctorName, additionalNotes, patientId, labName, prescribedBy, billNumber, hospitalName, idNumber, recordFrom, insuranceAmount } = req.body;
        const userId = req.userDetail._id;
        let patient;

        if (patientId) {
            patient = await FamilyMemberModel.findById(patientId);
            if (!patient) {
                return res.status(404).send({ msg: 'Patient not found' });
            }
        } else {
            patient = await User.findById(userId);
        }

        const file = req.file;
        if (!file) {
            return res.status(400).send({ msg: 'File is not provided' });
        }
        const filePath = file.path;
        const fileType = file.mimetype;
        const fileBuffer = await convertToPDF(filePath, fileType);

        const s3Key = generateKey(file.originalname);
        const s3Response = await uploadToS3(fileBuffer, s3Key, 'application/pdf');

        const healthRecord = new HealthRecord({
            title,
            fileURL: s3Response.Location,
            patientName: patient.name,
            typeOfRecord,
            testName,
            recordGeneratedDate: recordGeneratedDate || Date.now(),
            recordDoctorName,
            additionalNotes,
            userId: patient._id,
            age: patient.age,
            fileName,
            dateOfBirth: patient.dateOfBirth,
            labName,
            prescribedBy,
            billNumber,
            hospitalName,
            idNumber,
            recordFrom,
            insuranceAmount
        });

        await healthRecord.save();
        res.status(201).send({ msg: 'Health record uploaded successfully', data: healthRecord });
    } catch (error) {
        console.error('Error uploading health record:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});



// Update health record details
healthRecordRouter.patch('/:id', verifyToken, [
    body('title').optional().isString().withMessage('Title must be a string'),
    body('typeOfRecord').optional().isString().withMessage('Type of record must be a string'),
    body('testName').optional().isString(),
    body('recordGeneratedDate').optional().isISO8601().toDate(),
    body('recordDoctorName').optional().isString(),
    body('additionalNotes').optional().isString(),
    body('patientId').optional().isMongoId().withMessage('Patient ID must be a valid ID')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = req.userDetail._id;

        let patient;
        if (updates.patientId) {
            patient = await FamilyMemberModel.findById(updates.patientId);
            if (!patient) {
                return res.status(404).send({ msg: 'Patient not found' });
            }
            if (patient.user != userId) {
                return res.status(404).send({ msg: 'Patient not found' });
            }

            
        } else {
            patient = req.userDetail;
        }

        const healthRecord = await HealthRecord.findById(id);
        if (!healthRecord || healthRecord.userId.toString() !== userId.toString()) {
            return res.status(404).send({ msg: 'Health record not found' });
        }

        Object.assign(healthRecord, updates, {
            patientName: patient.name,
            age: patient.age,
            dateOfBirth: patient.dateOfBirth
        });

        await healthRecord.save();
        res.status(200).send({ msg: 'Health record updated successfully', healthRecord });
    } catch (error) {
        console.error('Error updating health record:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});



// Generate Temporary Link for Sharing
healthRecordRouter.post('/share/:id', verifyToken, [
    body('expiresIn').notEmpty().isInt({ min: 1 }).withMessage('Expiration time is required and must be at least 1 second')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const { expiresIn } = req.body;

        const healthRecord = await HealthRecord.findById(id);
        if (!healthRecord) {
            return res.status(404).send({ msg: 'Health record not found' });
        }

        const signedUrl = await generateSignedUrl(healthRecord.fileURL, expiresIn);
        res.status(200).send({ msg: 'Temporary link generated successfully', link: signedUrl });
    } catch (error) {
        console.error('Error generating temporary link:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});

// Get all health records
healthRecordRouter.get('/', verifyToken, async (req, res) => {
    try {
        const healthRecords = await HealthRecord.find({ userId: req.userDetail._id });
        res.status(200).json({ healthRecords });
    } catch (error) {
        console.error('Error fetching health records:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});



// Get health record by ID
healthRecordRouter.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const healthRecord = await HealthRecord.findById(id);
        if (!healthRecord || healthRecord.userId.toString() !== req.userDetail._id.toString()) {
            return res.status(404).send({ msg: 'Health record not found' });
        }
        res.status(200).json(healthRecord);
    } catch (error) {
        console.error('Error fetching health record:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});



// Download health record PDF
healthRecordRouter.get('/download/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const healthRecord = await HealthRecord.findById(id);
        if (!healthRecord || healthRecord.userId.toString() !== req.userDetail._id.toString()) {
            return res.status(404).send({ msg: 'Health record not found' });
        }

        // Generate a temporary signed URL for downloading the PDF
        const signedUrl = await generateSignedUrl(healthRecord.fileURL, 60); // Expires in 60 seconds
        res.status(200).json({ link: signedUrl });
    } catch (error) {
        console.error('Error downloading health record:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});



// Delete health record
healthRecordRouter.delete('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const healthRecord = await HealthRecord.findById(id);
        if (!healthRecord || healthRecord.userId.toString() !== req.userDetail._id.toString()) {
            return res.status(404).send({ msg: 'Health record not found' });
        }

        // Delete the file from S3
        const s3Key = healthRecord.fileURL.split('/').pop();
        await deleteFromS3(s3Key);

        // Delete the health record metadata from the database
        await HealthRecord.findByIdAndDelete(id);
        res.status(200).send({ msg: 'Health record deleted successfully' });
    } catch (error) {
        console.error('Error deleting health record:', error);
        res.status(500).send({ msg: 'Internal server error, try again later' });
    }
});






module.exports = healthRecordRouter;