const net = require('net');
const process = require('process');

// Poisson process generation and addition to queue. 
const queue = [];
let token = false;
function getPoissonDelay(lambda) {
    return -Math.log(1.0 - Math.random()) / lambda;
}

function generateRequests(lambda) {
    // Continue generating requests even if token is not yet received.
    const delay = getPoissonDelay(lambda); // lambda = 4 events per minute
    setTimeout(() => {
        const operation = getRandomOperation();
        const { number1, number2 } = getRandomArguments();
        // While with the token, don't create new requests, but schedule for next iteration.
        if(!token) queue.push(JSON.stringify({ operation, number1, number2 }));
        generateRequests(lambda); // Continue scheduling the next request
    }, delay * 1000); // Convert delay to milliseconds
}

function getRandomOperation() {
    const operations = ['add', 'sub', 'mul', 'div'];
    return operations[Math.floor(Math.random() * operations.length)];
}

function getRandomArguments() {
    return { number1: Math.floor(Math.random() * 100), number2: Math.floor(Math.random() * 100) };
}

// Function to send all commands in the queue to the server
function sendCommandsToServer() {
    if(!token) return;
    if (queue.length === 0) {
        console.log('----- NOTHING TO SEND, PASSING TOKEN -----');
        // Add delay before sending token
        sendTokenWithDelay(nextPeerIp, nextPeerPort);
        return;
    }  

    const socket = new net.Socket(); // Create a new TCP socket
    let responses = []; // Store all responses

    // Function to send a single command and wait for its response
    function sendCommand(command) {
        return new Promise((resolve, reject) => {
            socket.write(command, (err) => {
                if (err) {
                    reject(err); // Reject if there's an error while writing the command
                } else {
                    console.log('----- SENDING TO SERVER -----');
                    console.log(command);
                }
            });

            socket.once('data', (data) => {
                const { success, result, message } = JSON.parse(data.toString());
                if (success) console.log('Result: ', result);
                else console.log('Error: ', message);
                resolve(); // Resolve the promise once we get a response
            });
        });
    }

    // Open the socket and start sending commands
    socket.connect(3000, 'localhost', async () => {

        // Send commands one by one
        try {
            while (queue.length > 0) {
                const command = queue.shift(); // Get and remove the first command in the queue
                await sendCommand(command); // Wait for the response before sending the next command
            }

            socket.end(); // Close the socket after sending all commands
            console.log('----- ALL COMMANDS SENT -----');
            sendTokenWithDelay(nextPeerIp, nextPeerPort);  // Add delay before sending token

        } catch (error) {
            console.error('Error sending commands:', error);
        }
    });

    // Handle socket errors
    socket.on('error', (err) => {
        // console.error('Socket error:', err);
    });

    // Handle socket close event
    socket.on('close', () => {
    });
}

// Server setup function to listen for the token from another peer
function startPeerServer(ipAddress, port) {
    const server = net.createServer((clientSocket) => {
        const clientAddress = clientSocket.remoteAddress;
        const clientPort = clientSocket.remotePort;

        // Handle client messages
        clientSocket.on('data', (data) => {
            const message = data.toString().trim();
            // console.log(`Message from peer: ${message}`);

            if (message === 'TOKEN') {
                console.log('----- TOKEN RECEIVED -----');
                token = true;
                sendCommandsToServer();  // Start sending requests once the token is received
            }
        });

        // Handle client disconnect
        clientSocket.on('end', () => {
        });

        clientSocket.on('error', (err) => {
            console.error(`Error with client ${clientAddress}:${clientPort}:`, err.message);
        });
    });

    server.listen(port, ipAddress, () => {
        console.log(`----- SERVER RUNNING ON ${ipAddress}:${port} -----`);
    });

    server.on('error', (err) => {
        console.error('Server error:', err.message);
    });
}

// Function to send the token with a delay to slow down token passing
function sendTokenWithDelay(peerIp, peerPort) {
    console.log('----- WAITING BEFORE SENDING TOKEN -----');
    setTimeout(() => {
        sendToken(peerIp, peerPort);
    }, 2000);
}

// Function to send the token to another peer
function sendToken(peerIp, peerPort) {
    const socket = new net.Socket(); // Create a new TCP socket

    // Connect to the other peer and send the token
    socket.connect(peerPort, peerIp, () => {
        console.log('----- SENDING TOKEN TO PEER -----');
        socket.write('TOKEN\n'); // Send the token to the peer
        token = false;  // Reset token state
        socket.end(); // Close the socket after sending the token
    });

    // Handle socket errors
    socket.on('error', (err) => {
        sendTokenWithDelay(peerIp, peerPort);
        // console.error('Error sending token:', err);
    });

    // Handle socket close event
    socket.on('close', () => {
    });
}

// Main execution
if (process.argv.length < 6) {
    console.error('Usage: node yourScript.js <ipAddress> <port> <nextPeerIp> <nextPeerPort>');
    process.exit(1);
}

const [ipAddress, port, nextPeerIp, nextPeerPort] = process.argv.slice(2);

// Start the peer server.
Promise.all([startPeerServer(ipAddress, parseInt(port)), generateRequests(4 / 60)]);