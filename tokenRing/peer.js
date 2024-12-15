const net = require('net');
const { Worker } = require('worker_threads');
const process = require('process');

// The requests queue.
const queue = [];
// The flag whether we hold the token or not.
let token = false;
// Peer and server sockets.
let peerSocket;
let serverSocket;
// Flag to track shutdown state.
let shuttingDown = false;


/**
 * Sets up a persistent connection to the specified ip and port.
 * 
 * @param {string} ip             - IP address.
 * @param {number} port           - Port.
 * @param {string} name           - Name of the socket for logging purposes.
 * @param {function} onData       - Callback to handle incoming data.
 * @returns {Promise<net.Socket>} - The connected socket.
 */
function setupPersistentSocket(ip, port, name, onData) {
    const retryDelay = 1000;
    return new Promise((resolve, reject) => {
        const attemptConnection = () =>{
            const socket = new net.Socket();
    
            socket.connect(port, ip, () => {
                console.log(`${name} connected to ${ip}:${port}`);
                resolve(socket);
            });
    
            socket.on('data', onData);
    
            socket.on('error', async (err) => {
                if (!shuttingDown) {
                    console.error(`${name} error: ${err.message}. Attempting to connect again in ${retryDelay / 1000} seconds.`);
                    setTimeout(attemptConnection, retryDelay);
                }
            });
        }
        attemptConnection();
    });
    
}

/**
 * Handles token passing logic.
 */
function sendToken() {
    if (!peerSocket || peerSocket.destroyed || shuttingDown) return;
    peerSocket.write('TOKEN');
    token = false;
}

/**
 * Handles data received from the peer socket.
 * 
 * @param {Buffer} data - Data received from the peer.
 */
function handlePeerSocketData(data) {
    const message = data.toString().trim();
    if (message === 'TOKEN') {
        token = true;
        sendCommandsToServer();
    } else if (message === 'SHUTDOWN') {
        initiateShutdown();
    }
}

/**
 * Initiates the shutdown process. Sends shutdown command to connected peer.
 */
function initiateShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('Initiating graceful shutdown...');
    if (peerSocket && !peerSocket.destroyed) {
        peerSocket.write('SHUTDOWN', () => {
            console.log('Notified next peer about shutdown.');
        });
    }

    cleanUpResources();
}

/**
 * Cleans up the resources.
 */
function cleanUpResources() {
    console.log('Cleaning up resources...');
    if (serverSocket && !serverSocket.destroyed) {
        serverSocket.end(() => console.log('Server socket closed.'));
    }

    if (peerSocket && !peerSocket.destroyed) {
        peerSocket.end(() => console.log('Peer socket closed.'));
    }

    setTimeout(() => {
        console.log('Shutdown complete.');
        process.exit(0); // Exit the process
    }, 1000);
}

/**
 * Sends commands to the server via the persistent server socket.
 */
function sendCommandsToServer() {
    if (!serverSocket || serverSocket.destroyed || shuttingDown) return;

    while (queue.length > 0) {
        const command = queue.shift();
        serverSocket.write(command);
    }

    sendToken();
}

/**
 * Handles data received from the server socket.
 * 
 * @param {Buffer} data - Data received from the server.
 */
function handleServerSocketData(data) {
    const { success, result, message } = JSON.parse(data.toString());
    if (success) console.log('Result:', result);
    else console.log('Error:', message);
}

/**
 * Starts the server to accept incoming connections from other peers.
 * 
 * @param {string} ipAddress - IP address of the current peer.
 * @param {number} port - Port of the current peer.
 */
function startPeerServer(ipAddress, port) {
    const server = net.createServer((clientSocket) => {
        clientSocket.on('data', handlePeerSocketData);

        clientSocket.on('error', (err) => {
            console.error('Client socket error:', err.message);
        });
    });

    server.listen(port, ipAddress, () => {
        console.log(`Server running on ${ipAddress}:${port}`);
    });

    server.on('error', (err) => {
        console.error('Server error:', err.message);
    });

    return server;
}


/**
 * Starts the worker for request generation.
 * 
 * @param {number} lambda - Rate of request generation.
 */
function startRequestGenerator(lambda) {
    const worker = new Worker('./requestGeneratorWorker.js');

    // Receive generated requests from the worker
    worker.on('message', (request) => {
        queue.push(JSON.stringify(request));
    });

    // Start generating requests
    worker.postMessage(lambda);

    worker.on('error', (err) => {
        console.error('Worker error:', err.message);
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Worker stopped with exit code ${code}`);
        }
    });
}

// Start listening for OS signals for graceful shutdown
process.on('SIGINT', initiateShutdown);
process.on('SIGTERM', initiateShutdown);

// Main execution
if (process.argv.length < 4) {
    console.error('Usage: node yourScript.js <nextPeerIp> <serverIp>');
    process.exit(1);
}

const [nextPeerIp, serverIp] = process.argv.slice(2);

( async () => {
    startPeerServer('0.0.0.0', 3000);
    serverSocket = await setupPersistentSocket(serverIp, 3030, 'ServerSocket', handleServerSocketData);
    peerSocket = await setupPersistentSocket(nextPeerIp, 3000, 'PeerSocket', handlePeerSocketData);
    startRequestGenerator(4 / 60);
})();
