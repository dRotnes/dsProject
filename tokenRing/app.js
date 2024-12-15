const net = require('net');

// Function to send the token to another peer
function sendToken(peerIp, peerPort) {
    const socket = new net.Socket(); // Create a new TCP socket

    // Connect to the other peer and send the token
    socket.connect(peerPort, peerIp, () => {
        console.log(`Connected to peer ${peerIp}:${peerPort}. Sending token...`);
        socket.write('TOKEN\n'); // Send the token to the peer
        socket.end(); // Close the socket after sending the token
        console.log('Token sent.');
    });

    // Handle socket errors
    socket.on('error', (err) => {
        console.error('Error sending token:', err);
    });

    // Handle socket close event
    socket.on('close', () => {
        console.log('Socket connection closed.');
    });
}

// Send the token to peer running on port 3001
sendToken('localhost', 3000);