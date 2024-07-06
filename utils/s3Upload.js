const AWS = require('aws-sdk');
const crypto = require('crypto');
const path = require('path');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const uploadToS3 = (buffer, key, mimeType) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'private'
    };

    return s3.upload(params).promise();
};

const generateSignedUrl = (key, expires) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Expires: expires
    };

    return s3.getSignedUrlPromise('getObject', params);
};

const generateKey = (originalname) => {
    const ext = path.extname(originalname);
    return `health-records/${crypto.randomBytes(16).toString('hex')}${ext}`;
};

const deleteFromS3 = async (key) => {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
    };

    return s3.deleteObject(params).promise();
};

module.exports = { uploadToS3, generateSignedUrl, generateKey, deleteFromS3 };
