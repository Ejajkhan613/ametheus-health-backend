const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');

// Initialize S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadFile = async (file) => {
  const fileStream = fs.createReadStream(file.path);
  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: path.basename(file.originalname),
    Body: fileStream,
  };

  try {
    await s3.send(new PutObjectCommand(uploadParams));
    return `https://YOUR_BUCKET_NAME.s3.amazonaws.com/${path.basename(file.originalname)}`;
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
};

module.exports = { uploadFile };
