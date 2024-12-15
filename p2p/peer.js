const net = require('net');
const process = require('process');
const os = require('os');

// Poisson distribution parameter
const lambda = 2 / 60;
// Time-to-live for each peer entry
const entryTTL = 120000;
// Stores peer data { peerIp: timestamp }
const peerMap = new Map();
// Stores peers connected to this peer by IP address
const neighborsMap = new Map();
// Get the peers neighbors from the command line.
const peersIps = process.argv.slice(2);

// Server setup.
// Handle client connections.
const server = net.createServer((clientSocket) => {
    const connectionIp = clientSocket.remoteAddress;
    // Check a socket connection to this peer already exists and add it to the map if not.
    if (!neighborsMap.has(connectionIp)) {
        console.log(`ADDED NEW NEIGHBOR: ${connectionIp}`);
        neighborsMap.set(connectionIp, clientSocket);
    }
    // Else, destroy socket.
    else {
        console.log(`Existing socket for ${connectionIp} found. Closing duplicate.`);
        clientSocket.destroy();
        return;
    }
});

// Listen on port 3000. 
server.listen(3000, '0.0.0.0', () => {
    console.log(`Server running...`);
});

// Event handler for errors.
server.on('error', (err) => {
    console.error('Server error:', err.message);
});

// Sockets setup (connections to other peers).
const attemptConnection = async () => {
    // Open socket.
    const socket = new net.Socket();

    // Event handler for connection.
    socket.connect(3000, peer, () => {
        console.log(`ADDED NEIGHBOR: ${peer}`);
        // Add the socket to the neighbors map.
        neighborsMap.set(peer, socket);
    });
    
    // Event handler for errors.
    socket.on('error', (err) => {
        // Close the socket.
        socket.destroy();
    });

    return socket;
}

// Setup sockets.
peersIps.forEach((peer) => {
    try {
        return new Promise((resolve, reject) => {
            let retries = 0;
        
            // If we reach the maximum number of retries. Stop trying to connect.
            if (retries > 3) {
                return reject(new Error(`Failed to connect to ${peerIp}`));
            }
            const connectToPeer = () => {
                // Check if a connection to this peer was already established by the other peer.
                if (neighborsMap.has(peerIp)) {
                    return resolve();
                }

                const peerSocket = attemptConnection();
                // Setup event handlers if connection is established.
                if (peerSocket) {
                    // Event handler for data received.
                    peerSocket.on('data', (data) => {
                        const message = data.toString().trim();
                        handleIncomingMessage(message);
                    });
                    // Event handler for data received.
                    peerSocket.on('close', (data) => {
                        neighborsMap.delete(peer);
                    });
                    // Resolve promise.
                    resolve();
                }
                // Increase numnber of retries.
                retries++;
                // Try to connect to the peer again in 2 seconds.
                setTimeout(connectToPeer, 2000);
            }
            connectToPeer();
        });
    }
    catch (error) {
        console.error(`UNAVAILABLE PEER: ${peer}`);
    }
});

startAntiEntropy();

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
        if (Date.now() - timestamp > entryTTL && peer !== selfIpAddress) {
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

/**
 * Shuts down and cleans up the resources.
 */
function initiateShutdown() {
    console.log('Shutting Down...');

    if (server) {
        server.close();
    }

    setTimeout(() => {
        console.log('Shutdown complete.');
        process.exit(0); // Exit the process
    }, 1000);
}

// Main Execution
if (process.argv.length < 3) {
    console.error('Usage: node peer.js <peerIps>');
    process.exit(1);
}

const selfIpAddress = getOwnIP();

// Start listening for OS signals for graceful shutdown
process.on('SIGINT', initiateShutdown);
process.on('SIGTERM', initiateShutdown);