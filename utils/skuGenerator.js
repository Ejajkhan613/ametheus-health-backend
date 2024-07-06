let skuCounter = 1;

function generateSKU(prefix = 'AH_H') {
    const sku = `${prefix}_${skuCounter.toString().padStart(4, '0')}`;
    skuCounter++;
    return sku;
}

module.exports = generateSKU;