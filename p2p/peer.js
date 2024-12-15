const net = require('net');
const process = require('process');
const os = require('os');

// Stores peer data { peerIp: timestamp }
const peerMap = new Map();
// Stores peers connected to this peer by IP address
const socketMap = new Map();
// Poisson distribution parameter
const lambda = 4 / 60;
// Time-to-live for each peer entry
const entryTTL = 60000;

/**
 * Sets up a server to accept incoming peer connections.
 * @param {string} ipAddress - IP address of the current peer.
 * @param {number} port - Port of the current peer.
 */
function startPeerServer(ipAddress, port) {
    const server = net.createServer((clientSocket) => {
        const connectionIp = clientSocket.remoteAddress;
        console.log(`New connection from: ${connectionIp}`);

        // Check if a connection to this peer already exists
        if (!socketMap.has(connectionIp)) {
            console.log(`Adding new socket for ${connectionIp}`);
            socketMap.set(connectionIp, clientSocket);
        } else {
            console.log(`Existing socket for ${connectionIp} found. Closing duplicate.`);
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
            console.log(`Connection to ${connectionIp} closed.`);
            socketMap.delete(connectionIp);
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
 * Sets up a persistent connection to the specified peer with retry logic.
 * @param {string} peerIp - IP address of the peer.
 * @param {number} peerPort - Port of the peer.
 * @returns {Promise<void>} - Resolves when the connection is established.
 */
async function setupPersistentSocket(peerIp, peerPort) {
    return new Promise((resolve) => {
        // Check if a connection to this peer already exists
        if (socketMap.has(peerIp)) {
            console.log(`Existing connection to ${peerIp} found. Reusing socket.`);
            return resolve();
        }

        const socket = new net.Socket();
        socket.connect(peerPort, peerIp, () => {
            console.log(`Connected to ${peerIp}:${peerPort}`);
            socketMap.set(peerIp, socket);

            socket.on('data', (data) => {
                const message = data.toString().trim();
                handleIncomingMessage(message);
            });

            socket.on('error', (err) => {
                console.error(`Socket error for ${peerIp}: ${err.message}`);
            });

            socket.on('close', () => {
                console.log(`Connection to ${peerIp} closed.`);
                socketMap.delete(peerIp);
            });

            resolve();
        });

        socket.on('error', (err) => {
            console.error(`Failed to connect to ${peerIp}: ${err.message}`);
        });
    });
}

/**
 * Handles incoming messages to register peers and update the map.
 * @param {string} message - The message containing peer data.
 */
function handleIncomingMessage(message) {
    try {
        const receivedData = JSON.parse(message);
        console.log(`Received data: ${receivedData}`);
        receivedData.forEach(([peerIp, timestamp]) => {
            // Update the map only if the new timestamp is more recent.
            peerMap.set(peerIp.toString(), Math.max(peerMap.get(peerIp) || 0, timestamp));
        });
        // Delete the expired peers.
        deleteExpiredPeers();
        console.log(`Updated peer map: ${peerMap.size} total nodes (${Array.from(peerMap.entries())})`);
    } catch (error) {
        console.error('Error processing incoming message:', error.message);
    }
}

/**
 * Disseminates the current peer map to all connected peers.
 */
function disseminatePeerMap() {
    // Set your own entry.
    peerMap.set(selfIpAddress, Date.now());
    // Delete the expired peers.
    deleteExpiredPeers();
    const validEntries = Array.from(peerMap.entries()).filter(([_, timestamp]) => {
        // Filter expired entries
        return Date.now() - timestamp <= entryTTL;
    });

    const message = JSON.stringify(validEntries);
    // Send it to every peer connected to itself.
    socketMap.forEach((socket, peerIp) => socket.write(message));
}

/**
 * Periodically updates the peer map using Anti-Entropy.
 */
function startAntiEntropy() {
    const delay = getPoissonDelay(lambda);
    setTimeout(() => {
        disseminatePeerMap();
        console.log(`Disseminated peer map: ${Array.from(peerMap.keys())}`);
        startAntiEntropy();
    }, delay * 1000);
}

/**
 * Deletes expired peers (timestamp < TTL).
 */
function deleteExpiredPeers() {
    peerMap.forEach((timestamp, peer) => {
        if (Date.now() - timestamp > entryTTL) {
            console.log(`Deleted peer: ${peer}`);
            peerMap.delete(peer);
        }
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
    console.error('Usage: node peer.js <peerIps>');
    process.exit(1);
}

async function setupInitialSockets() {
 // Establish connections to specified peers
    for (const peer of peersIps) {
        await setupPersistentSocket(peer, 3000);
    }
}
const peersIps = process.argv.slice(2);
const selfIpAddress = getOwnIP();

(async () => {
    await Promise.all([
        startPeerServer('0.0.0.0', 3000),
        setupInitialSockets,
        // Periodically disseminate the peer map
        startAntiEntropy,
    ])
})();