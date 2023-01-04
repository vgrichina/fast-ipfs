const test = require('tape');
const fs = require('fs').promises;

const { readCID, cidToString, CODEC_RAW, CODEC_DAG_PB } = require('../index.js');

const CID_V1_STR1 = 'bafkreiaqeb6w3ncofru3zqhkarwhob2hdfdygmnkmkio2njyanhsb46tba';
const CID_V1_BYTES1 = Buffer.from('0155122010207D6DB44E2C69BCC0EA046C77074719478331AA6290ED3538034F20F3D308', 'hex');

const CID_V0_STR1 = 'QmTE9Xp76E67vkYeygbKJrsVj8W2LLcyUifuMHMEkyRfUL';
const CID_V0_BYTES1 = Buffer.from('1220489FF56D497B0180BD24B37AA39B0FFFD95261AB83C33EF869E1727082FF55E9', 'hex');

test('parse CID v1 bytes', async (t) => {
    const { version, codec, hashType, hash } = readCID(CID_V1_BYTES1);
    t.equal(version, 1, 'version');
    t.equal(codec, CODEC_RAW, 'codec'); 
    t.equal(hashType, 0x12, 'hash type');
    t.equal(hash.length, 32, 'hash length');
});

test('CID v1 to string', async (t) => {
    t.equal(cidToString(CID_V1_BYTES1), CID_V1_STR1);
});

test('parse CID v0 bytes', async (t) => {
    const { version, codec, hashType, hash } = readCID(CID_V0_BYTES1);
    t.equal(version, 0, 'version');
    t.equal(codec, CODEC_DAG_PB, 'codec'); 
    t.equal(hashType, 0x12, 'hash type');
    t.equal(hash.length, 32, 'hash length');
});