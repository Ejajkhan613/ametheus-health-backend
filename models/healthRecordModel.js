const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const healthRecordSchema = new Schema({
    title: { type: String, required: true },
    fileURL: { type: String, required: true },
    patientName: { type: String, required: true },
    typeOfRecord: { type: String, required: true },
    recordGeneratedDate: { type: Date, default: Date.now },
    fileName: { type: String, required: true },
    additionalNotes: { type: String },
    recordDoctorName: { type: String },
    testName: { type: String },
    labName: { type: String },
    prescribedBy: { type: String },
    recordFrom: { type: String },
    billNumber: { type: String },
    hospitalName: { type: String },
    idNumber: { type: String },
    recordEndDate: { type: Date },
    insuranceAmount: { type: Number },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    age: { type: Number },
    dateOfBirth: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
