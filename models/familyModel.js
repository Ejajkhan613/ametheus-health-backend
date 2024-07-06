// models/familyMemberModel.js
const mongoose = require('mongoose');

const FamilyMemberSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: true
    },
    relation: {
        type: String,
        required: true,
        enum: [
            'GRANDMOTHER', 'GRANDFATHER', 'MOTHER', 'FATHER', 'SISTER', 'BROTHER',
            'COUSIN', 'DAUGHTER', 'SON', 'GRANDDAUGHTER', 'GRANDSON', 'WIFE',
            'HUSBAND', 'OTHER'
        ]
    },
    otherRelation: {
        type: String,
        default: ""
    },
    dateOfBirth: {
        type: Date,
        required: true
    },
    avatar: {
        type: String,
        default: ""
    },
    createdDate: {
        type: Date,
        default: Date.now
    }
});

const FamilyMemberModel = mongoose.model('FamilyMember', FamilyMemberSchema);

module.exports = FamilyMemberModel;
