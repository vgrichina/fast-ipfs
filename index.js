const assert = require('assert');
const multibase = require('multibase');

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

// // An IPFS MerkleDAG Link
// message PBLink {

// // multihash of the target object
// optional bytes Hash = 1;

// // utf string name. should be unique per object
// optional string Name = 2;

// // cumulative size of target object
// optional uint64 Tsize = 3;
// }

function readPBLink(data) {
    let link = readProto(data, (fieldNumber, value, result) => {
        switch (fieldNumber) {
            case 1:
                // Hash (CID actually)
                result.cid = value;
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

// // An IPFS MerkleDAG Node
// message PBNode {

// // refs to other objects
// repeated PBLink Links = 2;

// // opaque user data
// optional bytes Data = 1;
// }

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

function cidToString(cid) {
    return Buffer.from(multibase.encode('base32', cid)).toString('utf8');
}

function readBlock(data) {
    const cidVersion = data[0];
    assert(cidVersion === 1, `Unsupported CID version: ${cidVersion}`);

    const codec = data[1];

    const remainingData = data.subarray(2);

    const hashType = remainingData[0];
    assert(hashType === 0x12, `Unsupported hash type: ${hashType}`)
    const hashSize = remainingData[1];
    const hash = remainingData.subarray(2, 2 + hashSize);

    const blockData = remainingData.subarray(2 + hashSize);

    const cid = Buffer.concat([
        Buffer.from([cidVersion, codec, hashType, hashSize]),
        hash
    ]);

    // TODO: Refactor, use async when available? Make optional to check hash?
    const crypto = require('crypto');
    const computedHash = crypto.createHash('sha256').update(blockData).digest();
    assert(hash.equals(computedHash), 'Hash mismatch');

    if (codec === 0x55) {
        // raw binary

        return { cid, codec, data: blockData }
    } else if (codec === 0x70) {
        // dag-protobuf

        try {
            const node = readPBNode(blockData);
            return { cid, codec, data: blockData, node };
        } catch (err) {
            throw new Error(`Error reading PBNode: ${err}`);
        }
    } else {
        throw new Error(`Unsupported multicodec: ${codec}`);
    }
}

function readCar(fileData) {
    // Read blocks from the CAR file
    const blocks = [];
    let offset = 0;

    while (offset < fileData.length) {
        const [blockLength, dataOffset] = readVarint(fileData, offset);
        const data = fileData.subarray(dataOffset, dataOffset + blockLength);
        blocks.push({ blockLength, data, startOffset: offset });

        // Skip block
        offset = dataOffset + blockLength;
    }

    return blocks;
}

module.exports = { readCar, readBlock, cidToString };