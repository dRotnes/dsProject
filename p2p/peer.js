const net = require('net');
const process = require('process');
const os = require('os');

// Stores peer data { peerIp: timestamp }
const peerMap = new Map();
// Stores peers connected to this peer by IP address
const neighborsMap = new Map();
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

        // Check if a connection to this peer already exists. If not, add this socket to the neightbor Map
        if (!neighborsMap.has(connectionIp)) {
            console.log(`Adding new socket for ${connectionIp}`);
            neighborsMap.set(connectionIp, clientSocket);
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
            neighborsMap.delete(connectionIp);
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
async function setupPersistentSocket(peerIp, peerPort, retryDelay = 2000, maxRetries = 5) {
    return new Promise((resolve, reject) => {
        let retries = 0;

        const attemptConnection = () => {
            // Check if a connection to this peer already exists
            if (neighborsMap.has(peerIp)) {
                // console.log(`Existing connection to ${peerIp} found. Reusing socket.`);
                return resolve();
            }

            if (retries > maxRetries) {
                // console.error(`Max retries reached for ${peerIp}. Giving up.`);
                return reject(new Error(`Failed to connect to ${peerIp}`));
            }

            const socket = new net.Socket();

            socket.connect(peerPort, peerIp, () => {
                console.log(`Successfully connected to ${peerIp}:${peerPort}`);
                neighborsMap.set(peerIp, socket);

                socket.on('data', (data) => {
                    const message = data.toString().trim();
                    handleIncomingMessage(message);
                });

                socket.on('error', (err) => {
                    // console.error(`Socket error for ${peerIp}: ${err.message}`);
                });

                socket.on('close', () => {
                    // console.log(`Connection to ${peerIp} closed.`);
                    neighborsMap.delete(peerIp);
                });

                resolve(); // Connection established, resolve the Promise
            });

            socket.on('error', (err) => {
                retries++;
                // console.error(`Failed to connect to ${peerIp}: ${err.message}. Retrying in ${retryDelay}ms...`);
                setTimeout(attemptConnection, retryDelay);
            });
        };

        attemptConnection(); // Start the connection attempt
    });
}

/**
 * Handles incoming messages to register peers and update the map.
 * @param {string} message - The message containing peer data.
 */
function handleIncomingMessage(message) {
    try {
        const receivedData = JSON.parse(message);
        receivedData.forEach(([peerIp, timestamp]) => {
            // Update the map only if the new timestamp is more recent.
            peerMap.set(peerIp.toString(), Math.max(peerMap.get(peerIp) || 0, timestamp));
        });
        // Delete the expired peers.
        deleteExpiredPeers();
        console.log(`\nUPDATED NETWORK: ${peerMap.size} TOTAL NODES`);
    } catch (error) {
        console.error('ERROR: ', error.message);
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
    neighborsMap.forEach((socket, peerIp) => socket.write(message));
}

/**
 * Periodically updates the peer map using Anti-Entropy.
 */
function startAntiEntropy() {
    const delay = getPoissonDelay(lambda);
    setTimeout(() => {
        disseminatePeerMap();
        console.log(`\nDISSEMINATING NETWORK: ${peerMap.size} TOTAL PEERS`);
        startAntiEntropy();
    }, delay * 1000);
}

/**
 * Deletes expired peers (timestamp < TTL).
 */
function deleteExpiredPeers() {
    peerMap.forEach((timestamp, peer) => {
        if (Date.now() - timestamp > entryTTL) {
            peerMap.delete(peer);
            console.log(`\n DELETED EXPIRED PEER: ${peer}; NEW TOTAL: ${peerMap.size}`);
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

const peersIps = process.argv.slice(2);
const selfIpAddress = getOwnIP();

(async () => {
    startPeerServer('0.0.0.0', 3000);

    // Establish connections to specified peers
    for (const peer of peersIps) {
        await setupPersistentSocket(peer, 3000);
    }

    // Periodically disseminate the peer map
    startAntiEntropy();
})();