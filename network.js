const net = require('net');

const address = '127.0.0.1';
const port = 4001;

function lengthEncoded(data) {
    let length = Buffer.byteLength(data);
    // encode length as varint
    const lengthBytes = [];
    while (length > 0) {
        const byte = length & 0x7F;
        lengthBytes.push(byte);
        length = length >> 7;
    }

    return Buffer.concat([Buffer.from(lengthBytes), Buffer.from(data)]);
}

// Open socket
const socket = net.createConnection(port, address, () => {
    console.log('Connected to server!');
    const encoded = Buffer.concat([lengthEncoded('/multistream/1.0.0\n'), lengthEncoded('/echo/1.0.0\n')]);
    socket.write(encoded);
});

socket.on('data', (data) => {
    console.log('data', data.toString());
});