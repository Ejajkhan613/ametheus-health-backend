const { S3Client, DeleteObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const deleteFileFromS3 = async (fileUrl) => {
    try {
        const bucket = process.env.AWS_BUCKET_NAME;
        const key = fileUrl.split('/').pop();
        const deleteParams = {
            Bucket: bucket,
            Key: key
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
    } catch (error) {
        console.error('Error deleting file from S3:', error);
        throw new Error('Failed to delete file from S3');
    }
};

const uploadFileToS3 = async (fileBuffer, fileMimeType, fileName) => {
    try {
        const bucket = process.env.AWS_BUCKET_NAME;
        const uploadParams = {
            Bucket: bucket,
            Key: fileName,
            Body: fileBuffer,
            ContentType: fileMimeType, // Make sure this matches the actual file type
            ACL: 'public-read'
        };
        await s3Client.send(new PutObjectCommand(uploadParams));
        return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    } catch (error) {
        console.error('Error uploading file to S3:', error);
        throw new Error('Failed to upload file to S3');
    }
};

module.exports = { s3Client, deleteFileFromS3, uploadFileToS3 };
