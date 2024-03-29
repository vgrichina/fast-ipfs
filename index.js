const assert = require('assert');
const multibase = require('multibase');

// NOTE: Nice TLDR on how CAR files work: https://twitter.com/ryanshahine/status/1608424335500533761

const CODEC_RAW = 0x55;
const CODEC_DAG_PB = 0x70;

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

function writeVarint(value) {
    const buffer = Buffer.alloc(10);
    let offset = 0;
    while (true) {
        const byte = value & 0x7f;
        value >>= 7;
        if (value === 0) {
            buffer[offset++] = byte;
            return buffer.subarray(0, offset);
        }
        buffer[offset++] = byte | 0x80;
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

function writeProtoField(fieldNumber, wireType, value) {
    const fieldTag = (fieldNumber << 3) | wireType;
    const fieldTagBytes = writeVarint(fieldTag);
    switch (wireType) {
        case 0:
            // Varint
            return Buffer.concat([fieldTagBytes, writeVarint(value)]);
        case 1: {
            // 64-bit
            const buffer = Buffer.alloc(8);
            buffer.writeBigInt64LE(value);
            return Buffer.concat([fieldTagBytes, buffer]);
        }
        case 2: {
            // Length-delimited
            const buffer = Buffer.from(value);
            return Buffer.concat([fieldTagBytes, writeVarint(buffer.length), buffer]);
        }
        default:
            throw new Error(`Unsupported wire type: ${wireType}`);
    }
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

function writePBLink(link) {
    return Buffer.concat([
        writeProtoField(1, 2, link.cid),
        writeProtoField(2, 2, Buffer.from(link.name)),
        writeProtoField(3, 0, link.size),
    ]);
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

function writePBNode(node) {
    return Buffer.concat([
        ...(node.links || []).map(link => writeProtoField(2, 2, writePBLink(link))),
        writeProtoField(1, 2, node.data || Buffer.alloc(0)),
    ]);
}

// message Data {
// 	enum DataType {
// 		Raw = 0;
// 		Directory = 1;
// 		File = 2;
// 		Metadata = 3;
// 		Symlink = 4;
// 		HAMTShard = 5;
// 	}

// 	required DataType Type = 1;
// 	optional bytes Data = 2;
// 	optional uint64 filesize = 3;
// 	repeated uint64 blocksizes = 4;

// 	optional uint64 hashType = 5;
// 	optional uint64 fanout = 6;
// }

// message Metadata {
// 	optional string MimeType = 1;
// }


// See https://medium.com/@koivunej/the-road-to-unixfs-f3cf5222b2ef
// https://github.com/ipfs/kubo/blob/b3faaad1310bcc32dc3dd24e1919e9edf51edba8/unixfs/pb/unixfs.proto#L3

function readUnixFSData(data) {
    const result = readProto(data, (fieldNumber, value, result) => {
        switch (fieldNumber) {
            case 1:
                // Type
                result.type = value;
                break;
            case 2:
                // Data
                result.data = value;
                break;
            case 3:
                // File size
                result.fileSize = value;
                break;
            default:
                // NOTE: Just ignore other fields, given kubo didn't use them
        }
    });
    return result;
}


function cidToString(cid) {
    return Buffer.from(multibase.encode('base32', cid)).toString('utf8');
}

function stringToCid(string) {
    // TODO: Check if it's a valid CID
    return multibase.decode(string);
}

function readCID(data) {
    if (data[0] == 0x12 && data[1] == 0x20) {
        // CIDv0
        return {
            version: 0,
            codec: CODEC_DAG_PB,
            hashType: 0x12,
            hash: data.subarray(2, 2 + 0x20)
        };
    }

    const version = data[0];
    assert(version === 1, `Unsupported CID version: ${version}`);

    const codec = data[1];

    const hashType = data[2];
    assert(hashType === 0x12, `Unsupported hash type: ${hashType}. Only SHA-256 is supported.`)
    const hashSize = data[3];
    assert(hashSize === 32, 'Wrong SHA-256 hash size');
    const hash = data.subarray(4, 4 + hashSize);

    return { version, codec, hashType, hash };
}

function packCID({ version = 1, codec = CODEC_RAW, hashType = 0x12, hash }) {
    assert(hash.length === 32, 'Wrong SHA-256 hash size');

    if (version === 0) {
        return Buffer.concat([
            Buffer.from([0x12, 0x20]),
            hash
        ]);
    }

    return Buffer.concat([
        Buffer.from([version, codec, hashType, hash.length]),
        hash
    ]);
}

function readBlock(data) {
    const { version, codec, hashType, hash } = readCID(data);

    const cid = packCID({ version, codec, hashType, hash });
    const blockData = data.subarray(cid.length);

    if (codec === CODEC_RAW) {
        // raw binary

        return { cid, codec, data: blockData }
    } else if (codec === CODEC_DAG_PB) {
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

function validateBlock(cid, blockData) {
    const { hash } = readCID(cid);

    // TODO: Refactor, use async when available?
    const crypto = require('crypto');
    const computedHash = crypto.createHash('sha256').update(blockData).digest();
    assert(hash.equals(computedHash), 'Hash mismatch');
}

function readCAR(fileData) {
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

module.exports = {
    readCAR,
    readBlock, 
    readPBNode,
    writePBNode,
    readUnixFSData,
    readCID, 
    packCID,
    cidToString, 
    stringToCid,
    validateBlock,
    CODEC_RAW,
    CODEC_DAG_PB,
};