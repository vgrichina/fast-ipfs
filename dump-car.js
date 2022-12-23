const assert = require('assert');

const { readBlock, readVarint, cidToString } = require('./');

// Print usage info if not enough args and exit
if (process.argv.length < 3) {
    console.log('Usage: node dump-car.js <car file>');
    process.exit(1);
}

const carFile = process.argv[2];

(async () => {
    // Read blocks from the CAR file
    const blocks = [];
    const fileData = await require('fs').promises.readFile(carFile);
    let offset = 0;

    while (offset < fileData.length) {
        const [blockLength, dataOffset] = readVarint(fileData, offset);
        const data = fileData.subarray(dataOffset, dataOffset + blockLength);
        blocks.push({ blockLength, data, startOffset: offset });

        // Skip block
        offset = dataOffset + blockLength;
    }

    const header = blocks.shift();
    console.log('header', header);

    for (let block of blocks) {
        const { blockLength, data, startOffset } = block;
        console.log(`\nBlock at offset ${startOffset} with length ${blockLength}`);

        const blockInfo = readBlock(data);
        console.log('Codec:', '0x' + blockInfo.codec.toString(16));
        console.log('CID:', cidToString(blockInfo.cid));
        if (blockInfo.node && blockInfo.node.links.length > 0) {
            console.log('node', blockInfo.node)
            console.log('Links:');
            for (let link of blockInfo.node.links) {
                console.log(`   ${link.name} (${link.size}) -> ${cidToString(link.cid)}`);
            }
        }
    }

})().catch(err => {
    console.error(err);
    process.exit(1);
});

