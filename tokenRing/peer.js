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
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();

        // Connect to passed port and IP.
        socket.connect(port, ip, () => {
            console.log(`${name} connected to ${ip}:${port}`);
            resolve(socket);
        });

        // Handle data according to passed data handling function.
        socket.on('data', onData);

        // Handle error. Try to reconnect as many times as possible.
        socket.on('error', async (err) => {
            console.error(`${name} error: ${err.message}`);
            try {
                reconnectedSocket = await reconnectSocket(ip, port, name, onData); 
                resolve(reconnectedSocket);
            }
            catch (error) {
                console.error(`${name} failed to reconnect: ${reconnectError.message}`);
            }
        });

        // // Handle when connection is unexpectedly closed.
        // socket.on('close', async () => {
        //     console.log(`${name} closed. Attempting to reconnect...`);
        //     try {
        //         reconnectedSocket = await reconnectSocket(ip, port, name, onData); 
        //         resolve(reconnectedSocket);
        //     }
        //     catch (error) {
        //         console.error(`${name} failed to reconnect: ${reconnectError.message}`);
        //     }
        // });
    });
}

/**
 * Reconnects socket.
 * 
 * @param {string} ip             - IP address.
 * @param {number} port           - Port.
 * @param {string} name           - Name of the socket connection for logging purposes.
 * @param {function} onData       - Callback to handle incoming data.
 * @returns {Promise<net.Socket>} - The reconnected socket.
 */
function reconnectSocket(ip, port, name, onData) {
    return new Promise((resolve) => {
        const retryDelay = 500;
        const attemptReconnection = () => {
            console.log(`${name} attempting to reconnect to ${ip}:${port}...`);
            const socket = new net.Socket();

            // Connect to passed port and IP.
            socket.connect(port, ip, () => {
                console.log(`${name} reconnected to ${ip}:${port}`);
                resolve(socket);
            });

            // Handle data according to passed data handling function.
            socket.on('data', onData);

            // Handle error. Try to reconnect as many times as possible.
            socket.on('error', () => {
                console.log(`${name} retrying connection in ${retryDelay / 1000} seconds...`);
                setTimeout(attemptReconnection, retryDelay);
            });
        };

        attemptReconnection();
    });
}

/**
 * Handles token passing logic.
 */
async function sendToken() {
    if (!peerSocket || peerSocket.destroyed) {
        console.error('Peer socket is unavailable. Reconnecting...');
        peerSocket = await setupPersistentSocket(nextPeerIp, 3000, 'PeerSocket', handlePeerSocketData);
    }
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
    }
}

/**
 * Sends commands to the server via the persistent server socket.
 */
async function sendCommandsToServer() {
    if (!serverSocket || serverSocket.destroyed) {
        console.error('Server socket is unavailable. Reconnecting...');
        serverSocket = await setupPersistentSocket('localhost', 3000, 'ServerSocket', handleServerSocketData);
    }

    try {
        while (queue.length > 0) {
            const command = queue.shift();
            await sendCommand(serverSocket, command);
        }
        sendToken();
    } catch (err) {
        console.error('Error sending commands to server:', err.message);
    }
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
 * Sends a single command and waits for its response.
 * 
 * @param {net.Socket} socket - The socket to send the command.
 * @param {string} command - The command.
 * @returns {Promise<void>}
 */
function sendCommand(socket, command) {
    return new Promise((resolve, reject) => {
        socket.write(command, (err) => {
            if (err) return reject(err);
        });

        socket.once('data', () => resolve());
    });
}

/**
 * Starts the server to accept incoming connections from other peers.
 * 
 * @param {string} ipAddress - IP address of the current peer.
 * @param {number} port - Port of the current peer.
 */
function startPeerServer(ipAddress, port) {
    const server = net.createServer((clientSocket) => {
        clientSocket.on('data', handlePeerSocketData)

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


// Main execution
if (process.argv.length < 4) {
    console.error('Usage: node yourScript.js <nextPeerIp> <serverIp>');
    process.exit(1);
}

const [nextPeerIp, serverIp] = process.argv.slice(2);

( async () => {
    [_, serverSocket, peerSocket, _] = await Promise.all([
        startPeerServer('localhost', 3000),
        setupPersistentSocket(serverIp, 3030, 'ServerSocket', handleServerSocketData),
        setupPersistentSocket(nextPeerIp, 3000, 'PeerSocket', handlePeerSocketData),
        startRequestGenerator(4 / 60)
    ]);
})();
