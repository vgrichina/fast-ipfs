const test = require('tape');
const fs = require('fs').promises;

const { readCAR, readBlock, cidToString, CODEC_RAW, CODEC_DAG_PB, validateBlock, readUnixFSData, writePBNode, stringToCid } = require('../index.js');

// hello.car contains a single block with a single string, but encoded as a DAG-PB node
const HELLO_CAR_FILE = './test/data/hello.car';

async function parseAndValidate(t, carFile) {
    const carData = await fs.readFile(carFile);
    const [, ...rawBlocks] = readCAR(carData);
    for (let block of rawBlocks) {
        const blockInfo = readBlock(block.data);
        t.ok(blockInfo.cid);
        t.ok(blockInfo.codec);
        if (blockInfo.codec === CODEC_RAW) {
            t.ok(blockInfo.data);
        } else if (blockInfo.codec === CODEC_DAG_PB) {
            t.ok(blockInfo.node);
        } else {
            t.fail(`Unexpected codec 0x${blockInfo.codec.toString(16)}`);
        }
        validateBlock(blockInfo.cid, blockInfo.data);
    }
}

test('split hello.car into blocks', async (t) => {
    const carData = await fs.readFile(HELLO_CAR_FILE);
    const rawBlocks = readCAR(carData);
    const expectedLengths = [ 56, 55 ];
    t.deepEqual(rawBlocks.map(b => b.blockLength), expectedLengths);
    for (let block of rawBlocks) {
        t.equal(block.data.length, block.blockLength);
    }
});

test('parse and validate hello.car blocks', async (t) => {
    await parseAndValidate(t, HELLO_CAR_FILE);
});

test('parse hello.car block content', async (t) => {
    const carData = await fs.readFile(HELLO_CAR_FILE);
    const [, rawBlock] = readCAR(carData);
    const blockInfo = readBlock(rawBlock.data);
    t.equal(blockInfo.codec, CODEC_DAG_PB);
    const blockData = readUnixFSData(blockInfo.node.data);
    t.equal(blockData.data.toString('utf8'), 'Hello, World\n');
    t.deepEqual(blockInfo.node.links, []);
});

// web4.car contains static files used by web4.near.page website
const WEB4_CAR_FILE = './test/data/web4.car';

test('split web4.car into blocks', async (t) => {
    const carData = await fs.readFile(WEB4_CAR_FILE);
    const rawBlocks = readCAR(carData);
    const expectedLengths = [ 58, 11488, 392, 13382, 13815, 1613, 7833, 3616, 440, 40, 90, 95 ];
    t.deepEqual(rawBlocks.map(b => b.blockLength), expectedLengths);
    for (let block of rawBlocks) {
        t.equal(block.data.length, block.blockLength);
    }
});

test('parse and validate web4.car blocks', async (t) => {
    await parseAndValidate(t, WEB4_CAR_FILE);
});

test('parse web4.car CIDs', async (t) => {
    const carData = await fs.readFile(WEB4_CAR_FILE);
    const [header, ...rawBlocks] = readCAR(carData);
    // TODO: Parse header and check root CID
    const blocks = rawBlocks.map(b => readBlock(b.data));
    const cids = blocks.map(b => cidToString(b.cid));
    const EXPECTED_CIDS = [
        'bafkreiaqeb6w3ncofru3zqhkarwhob2hdfdygmnkmkio2njyanhsb46tba',
        'bafkreibqdpw5vjiloxlt64mnxpyeucjwqyxy34cxmkzfqcru3gvfzixmp4',
        'bafkreibxxxpva5lpcge263lkx6yyx3tkpkfcqwtx3ujr3lz2xcxeeqtsze',
        'bafkreic7ra6yc55c3ych75rjdetnvmnig3l7u2ujhzloy26pkghth43cua',
        'bafkreidndhj7jyy3upcypraiwjfs5wvwlt42bz7j3pzmwvgq3lwcmmcvjq',
        'bafkreihu27uckd4pcjhyw7iipzpcmb3gunfqph65yq7hwigyyggkd2joke',
        'bafkreihwzlmtjajwh4od6urlecyxw74dub7l5cnzxgc5kmbsphde2zcymu',
        'bafybeiaqy5c3qam5kd5oafrziutpqtbltwla5lj3feydfxjsyqusu7cndi',
        'bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354',
        'bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi',
        'bafybeihgn4nvivxmd77xwr6fa6ywjtsdwwxvscrmqady5nzjf72r6bpmbe'
    ];
    t.deepEqual(cids, EXPECTED_CIDS);
});

const EXPECTED_BLOCKS = [{
    cid: 'bafybeiaqy5c3qam5kd5oafrziutpqtbltwla5lj3feydfxjsyqusu7cndi',
    links: [
        { name: '_index.html', size: 13346, cid: 'bafkreibxxxpva5lpcge263lkx6yyx3tkpkfcqwtx3ujr3lz2xcxeeqtsze' },
        { name: 'index.html', size: 13779, cid: 'bafkreic7ra6yc55c3ych75rjdetnvmnig3l7u2ujhzloy26pkghth43cua' },
        { name: 'manifest.arkb', size: 356, cid: 'bafkreibqdpw5vjiloxlt64mnxpyeucjwqyxy34cxmkzfqcru3gvfzixmp4' },
        { name: 'normalize.css', size: 7797, cid: 'bafkreihu27uckd4pcjhyw7iipzpcmb3gunfqph65yq7hwigyyggkd2joke' },
        { name: 'skeleton.css', size: 11452, cid: 'bafkreiaqeb6w3ncofru3zqhkarwhob2hdfdygmnkmkio2njyanhsb46tba' },
        { name: 'tmp.html', size: 3580, cid: 'bafkreihwzlmtjajwh4od6urlecyxw74dub7l5cnzxgc5kmbsphde2zcymu' },
        { name: 'under-construction', size: 1636, cid: 'bafybeihgn4nvivxmd77xwr6fa6ywjtsdwwxvscrmqady5nzjf72r6bpmbe' }
    ]
}, {
    cid: 'bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi',
    links: [
        { name: 'dist', size: 52350, cid: 'bafybeiaqy5c3qam5kd5oafrziutpqtbltwla5lj3feydfxjsyqusu7cndi' }
    ]
}, {
    cid: 'bafybeihgn4nvivxmd77xwr6fa6ywjtsdwwxvscrmqady5nzjf72r6bpmbe',
    links: [
        { name: 'index.html', size: 1577, cid: 'bafkreidndhj7jyy3upcypraiwjfs5wvwlt42bz7j3pzmwvgq3lwcmmcvjq' }
    ]
}];

test('parse web4.car links', async (t) => {
    const carData = await fs.readFile(WEB4_CAR_FILE);
    const [, ...rawBlocks] = readCAR(carData);
    const blocks = rawBlocks.map(b => readBlock(b.data));
    const blocksWithLinks = blocks.filter(b => b.node && b.node.links.length > 0).map(b => ({
        cid: cidToString(b.cid),
        links: b.node.links.map(l => ({ name: l.name, size: l.size, cid: cidToString(l.cid) }))
    }));
    t.deepEqual(blocksWithLinks, EXPECTED_BLOCKS);
});

test('generate blocks with links like web4.car', async (t) => {
    const carData = await fs.readFile(WEB4_CAR_FILE);
    const [, ...rawBlocks] = readCAR(carData);
    const blocksWithLinks = rawBlocks.map(b => readBlock(b.data)).filter(b => b.node && b.node.links.length > 0);
    const BLOCKS = EXPECTED_BLOCKS.map(b => ({
        links: b.links.map(l => ({
            name: l.name,
            size: l.size,
            cid: stringToCid(l.cid)
        })),
        data: Buffer.from([8, 1]) // TODO: Why this data needed to match?
    }));

    const UNDER_CONSTRUCTION = BLOCKS[2];
    const underConstructionData = writePBNode(UNDER_CONSTRUCTION);
    t.equal(underConstructionData.toString('hex'), blocksWithLinks[2].data.toString('hex'));

    const ROOT = BLOCKS[1];
    const rootData = writePBNode(ROOT);
    t.equal(rootData.toString('hex'), blocksWithLinks[1].data.toString('hex'));

    const DIST = BLOCKS[0];
    const distData = writePBNode(DIST);
    t.equal(distData.toString('hex'), blocksWithLinks[0].data.toString('hex'));
});