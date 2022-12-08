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
        console.log(data);

        const cidBytes = readCID(data);
        // const remainingData = data.subarray(cidBytes.length);
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
    console.log('readPBLink', data.toString('hex'));
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
                result.tsize = value;
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
    // TODO: Figure out why first link is always not parsable as a PBLink
    node.links = (node.links || []).slice(1).map(readPBLink);

    return node;
}

function readCID(data) {
    const cidVersion = data[0];
    assert(cidVersion === 1, `Unsupported CID version: ${cidVersion}`);

    const cidCodec = data[1];

    const remainingData = data.subarray(2);

    console.log(`CID version: ${cidVersion}`);
    // hex codec
    console.log(`CID codec: 0x${cidCodec.toString(16)}`);

    if (cidCodec === 0x55) {
        // raw binary
        console.log('data', remainingData);
    } else if (cidCodec === 0x70) {
        // dag-protobuf
        try {
            const node = readPBNode(remainingData);
            console.log('node', node);
        } catch (err) {
            console.error('Error reading PBNode', err, remainingData.toString('hex'));
        }
    } else {
        throw new Error(`Unsupported multicodec: ${cidCodec}`);
    }
}