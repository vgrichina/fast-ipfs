# fast-ipfs

The goal of this project is to provide a set of tools to make it easy to use IPFS. Optimized for speed, ease of use and size (uses minimum dependencies).

It generally tries to avoid using the IPFS core modules and instead uses the lower level modules to provide a more flexible and faster alternative.

## Installation

```bash
npm install fast-ipfs
```

## Usage

Read a CAR file and print out the blocks

```js

    const fileData = await require('fs').promises.readFile(carFile);
    const blocks = readCAR(fileData);

    const header = blocks.shift();

    for (let block of blocks) {
        const { blockLength, data, startOffset } = block;
        console.log(`\nBlock at offset ${startOffset} with length ${blockLength}`);

        const blockInfo = readBlock(data);
        validateBlock(blockInfo.cid, blockInfo.data);

        console.log('Codec:', '0x' + blockInfo.codec.toString(16));
        console.log('CID:', cidToString(blockInfo.cid));
        if (blockInfo.node && blockInfo.node.links.length > 0) {
            console.log('Links:');
            for (let link of blockInfo.node.links) {
                console.log(`   ${link.name} (${link.size}) -> ${cidToString(link.cid)}`);
            }
        }
    }
```

Note that this is also available as ready to use script:

```bash
node ./scripts/dump-car.js <car file>
```


## Who uses it?

- [web4-deploy](https://github.com/vgrichina/web4-deploy) - deploy your web4 dapp using NEAR and IPFS. Uses `fast-ipfs` to read CAR files and upload to NEARFS.
- [nearfs](https://github.com/vgrichina/nearfs) - NEARFS is a file system that uses NEAR blockchain as a storage. Uses `fast-ipfs` to parse IPFS blocks.
