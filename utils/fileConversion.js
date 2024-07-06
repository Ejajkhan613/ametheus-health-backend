// utils/fileConversion.js
const sharp = require('sharp');
const mammoth = require('mammoth');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const convertToPDF = async (filePath, mimeType) => {
    let pdfBuffer;

    if (mimeType === 'application/pdf') {
        pdfBuffer = fs.readFileSync(filePath);
    } else if (['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
        const image = await sharp(filePath).png().toBuffer();
        const pdfDoc = await PDFDocument.create();
        const imageEmbed = await pdfDoc.embedPng(image);
        const page = pdfDoc.addPage([imageEmbed.width, imageEmbed.height]);
        page.drawImage(imageEmbed, { x: 0, y: 0, width: imageEmbed.width, height: imageEmbed.height });
        pdfBuffer = await pdfDoc.save();
    } else if (['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)) {
        const { value } = await mammoth.convertToHtml({ path: filePath });
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        page.drawText(value, {
            x: 50,
            y: 750,
            size: 12,
            maxWidth: 500
        });
        pdfBuffer = await pdfDoc.save();
    } else {
        throw new Error('Unsupported file type');
    }

    return pdfBuffer;
};

module.exports = convertToPDF;