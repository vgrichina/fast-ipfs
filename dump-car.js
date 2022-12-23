const assert = require('assert');
const { link } = require('fs');

// Print usage info if not enough args and exit
if (process.argv.length < 3) {
    console.log('Usage: node dump-car.js <car file>');
    process.exit(1);
}

const carFile = process.argv[2];

function readVarint(data, offset) {
    let value = 0;
    let shift = 0;
    while (true) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if (byte < 0x80) {
            return [value, offset];
        }
        shift += 7;
    }
}

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
    }

})().catch(err => {
    console.error(err);
    process.exit(1);
});

// // An IPFS MerkleDAG Link
// message PBLink {

// // multihash of the target object
// optional bytes Hash = 1;

// // utf string name. should be unique per object
// optional string Name = 2;

// // cumulative size of target object
// optional uint64 Tsize = 3;
// }

// // An IPFS MerkleDAG Node
// message PBNode {

// // refs to other objects
// repeated PBLink Links = 2;

// // opaque user data
// optional bytes Data = 1;
// }

function readProto(data, processField) {
    const result = {};
    let offset = 0;
    while (offset < data.length) {
        let fieldTag;
        [fieldTag, offset] = readVarint(data, offset);
        const fieldNumber = fieldTag >> 3;
        const wireType = fieldTag & 0x7;
        let value;
        switch (wireType) {
            case 0:
                // Varint
                [value, offset] = readVarint(data, offset);
                break;
            case 1:
                // 64-bit
                value = data.readBigUInt64LE(offset);
                offset += 8;
                break;
            case 2: {
                // Length-delimited
                let length;
                [length, offset] = readVarint(data, offset);
                value = data.subarray(offset, offset + length);
                offset += length;
                break;
            }
            default:
                throw new Error(`Unsupported wire type: ${wireType}`);
        }
        processField(fieldNumber, value, result);
    }
    return result;
}

function readPBLink(data) {
    let link = readProto(data, (fieldNumber, value, result) => {
        switch (fieldNumber) {
            case 1:
                // Hash
                result.hash = value;
                break;
            case 2:
                // Name
                result.name = value.toString('utf8');
                break;
            case 3:
                // Tsize
                result.size = value;
                break;
            default:
                throw new Error(`Unsupported PBLink field number: ${fieldNumber}`);
        }
    });
    return link;
}

function readPBNode(data) {
    const node = readProto(data, (fieldNumber, value, result) => {
        switch (fieldNumber) {
            case 1:
                // Data
                result.data = value;
                break;
            case 2:
                // Links
                result.links = [...(result.links || []), value];
                break;
            default:
                throw new Error(`Unsupported PBNode field number: ${fieldNumber}`);
        }
    });
    node.links = (node.links || []).map(readPBLink);

    return node;
}

const multibase = require('multibase');

function cidToString(cid) {
    return Buffer.from(multibase.encode('base32', cid)).toString('utf8');
}

function readBlock(data) {
    const cidVersion = data[0];
    assert(cidVersion === 1, `Unsupported CID version: ${cidVersion}`);

    const codec = data[1];

    const remainingData = data.subarray(2);

    console.log(`CID version: ${cidVersion}`);
    // hex codec
    console.log(`codec: 0x${codec.toString(16)}`);

    const hashType = remainingData[0];
    assert(hashType === 0x12, `Unsupported hash type: ${hashType}`)
    const hashSize = remainingData[1];
    const hash = remainingData.subarray(2, 2 + hashSize);

    const blockData = remainingData.subarray(2 + hashSize);

    console.log('CID', cidToString(Buffer.concat([
        Buffer.from([cidVersion, codec, hashType, hashSize]),
        hash
    ])));

    const crypto = require('crypto');
    const computedHash = crypto.createHash('sha256').update(blockData).digest();
    assert(hash.equals(computedHash), 'Hash mismatch');

    if (codec === 0x55) {
        // raw binary

        // do nothing for now
    } else if (codec === 0x70) {
        // dag-protobuf

        // print data with xxd command line utility
        console.log(require('child_process').execSync(`echo ${blockData.toString('hex')} | xxd -r -p | xxd`).toString('utf8'));

        try {
            const node = readPBNode(blockData);

            console.log('\nlinks:');
            for (let link of node.links) {
                const cidStr = cidToString(link.hash);
                console.log(`${link.name} ${link.size} ${cidStr}`);
            }
        } catch (err) {
            console.error('Error reading PBNode', err, blockData.toString('hex'));
        }
    } else {
        throw new Error(`Unsupported multicodec: ${codec}`);
    }
}