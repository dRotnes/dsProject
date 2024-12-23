const net = require('net');
const process = require('process');
const os = require('os');

let neighborsMap = new Map();

/**
 * Sets up a server to accept incoming peer connections.
 * @param {string} ipAddress - IP address of the current peer.
 * @param {number} port - Port of the current peer.
 */
function startPeerServer(ipAddress, port) {
    const server = net.createServer((clientSocket) => {
        const connectionIp = clientSocket.remoteAddress;

        // Check if a connection to this peer already exists. If not, add this socket to the neightbor Map
        if (!neighborsMap.has(connectionIp)) {
            console.log(`ADDED NEIGHBOR: ${connectionIp}`);
            neighborsMap.set(connectionIp, clientSocket);
        } 
        else {
            clientSocket.destroy();
            return;
        }

        clientSocket.on('data', (data) => {
            const message = data.toString().trim();
            handleIncomingMessage(message);
        });

        clientSocket.on('error', (err) => {
            console.error('Client socket error:', err.message);
        });

        clientSocket.on('close', () => {
            console.log(`REMOVED NEIGHBOR: ${connectionIp}`);
            neighborsMap.delete(connectionIp);
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
 * Sets up a persistent connection to the specified peer with retry logic.
 * @param {string} peerIp - IP address of the peer.
 * @param {number} peerPort - Port of the peer.
 * @returns {Promise<void>} - Resolves when the connection is established.
 */
async function setupPersistentSocket(peerIp, peerPort, retryDelay = 2000, maxRetries = 5) {
    return new Promise((resolve, reject) => {
        let retries = 0;

        const attemptConnection = () => {
            // Check if a connection to this peer already exists
            if (neighborsMap.has(peerIp)) {
                return resolve();
            }

            if (retries > maxRetries) {
                return reject(new Error(`Failed to connect to ${peerIp}`));
            }

            const socket = new net.Socket();

            socket.connect(peerPort, peerIp, () => {
                console.log(`ADDED NEIGHBOR: ${peerIp}`);
                neighborsMap.set(peerIp, socket);

                socket.on('data', (data) => {
                    const message = data.toString().trim();
                    handleIncomingMessage(message);
                });

                socket.on('error', (err) => {
                });

                socket.on('close', () => {
                    console.log(`REMOVED NEIGHBOR: ${peerIp}`);
                    neighborsMap.delete(peerIp);
                });

                resolve();
            });

            socket.on('error', (err) => {
                retries++;
                setTimeout(attemptConnection, retryDelay);
            });
        };

        attemptConnection();
    });
}

/**
 * Returns the delay to apply when creating the requests.
 * @param {number} lambda - The lambda to use as guideline.
 * @returns {number}
 */
function getPoissonDelay(lambda) {
    return -Math.log(1.0 - Math.random()) / lambda;
}

/**
 * Get the local IP address of the machine.
 * @returns {string | null} The local IP address, or null if not found.
 */
function getOwnIP() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const addresses = networkInterfaces[interfaceName];
        for (const address of addresses) {
            // Select the first IPv4 address that is not internal (127.0.0.1)
            if (address.family === 'IPv4' && !address.internal) {
                return address.address;
            }
        }
    }
    return null;
}

// Main Execution
if (process.argv.length < 3) {
    console.error('Usage: node peer.js [peerIps]');
    process.exit(1);
}
const peersIps = process.argv.slice(2);
const selfIpAddress = getOwnIP();

(async () => {
    server = startPeerServer('0.0.0.0', 4000);
    // Establish connections to specified peers
    for (const peer of peersIps) {
        try {
            await setupPersistentSocket(peer, 4000);
        }
        catch (error) {
            console.error(`Failed to connect to peer ${peer}. Continuing without it`);
        }
    }
    console.log(neighborsMap);
})();