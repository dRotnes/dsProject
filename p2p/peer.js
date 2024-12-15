const net = require('net');
const process = require('process');
const os = require('os');

// Stores peer data { peerIp: timestamp }
const peerMap = new Map();
// Stores peers connected to this peer
const socketArray = [];
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
    const server = net.createServer(async (clientSocket) => {
        // This makes sense when we have different machines. It's not possible when I have one machine because the socket and server Ip.
        const connectionIp = clientSocket.remoteAddress;
        console.log(`New Connection: ${connectionIp}`);
        if (!socketArray.find((socket) => socket.remoteAddress === connectionIp)) {
            // Add the new peer connected to the array of peers connected.
            socketArray.push(await setupPersistentSocket(connectionIp, 3000, `PeerSocket`));
        }
        
        clientSocket.on('data', async (data) => {
            const message = data.toString().trim();
            handleIncomingMessage(message);
        });

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
 * Handles incoming messages to register peers and update the map.
 * @param {string} message - The message containing peer data.
 */
function handleIncomingMessage(message) {
    try {
        const receivedData = JSON.parse(message);
        console.log(receivedData);
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
 * Disseminates the current peer map to a connected peer.
 * @param {net.Socket} socket - The socket to send the map.
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
    
    // Send only valid entries as JSON.
    const message = JSON.stringify(validEntries);
    // Send it to every peer connected to itself.
    socketArray.forEach((socket) => socket.write(message));
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
 * Sets up a persistent connection to the specified peer with retry logic.
 * @param {string} peerIp - IP address of the peer.
 * @param {number} peerPort - Port of the peer.
 * @param {string} name - Name of the connection.
 * @returns {Promise<net.Socket>} - The connected socket.
 */
async function setupPersistentSocket(peerIp, peerPort, name) {
    return new Promise((resolve, reject) => {
        const connectToPeer = () => {
            const socket = new net.Socket();
            socket.connect(peerPort, peerIp, () => {
                console.log(`${name} connected to ${peerIp}:${peerPort}`);
                resolve(socket);

                socket.on('data', (data) => {
                    handleIncomingMessage(data.toString());
                });

                socket.on('error', (err) => {
                    console.error(`${name} error: ${err.message}`);
                });

                socket.on('close', () => {
                    console.log(`${name} connection closed`);
                    socketArray = socketArray.filter(item => item !== socket);
                });
            });

            socket.on('error', (err) => {
                console.error(`${name} error: ${err.message}`);
                console.log(`Retrying connection to ${peerIp}:${peerPort} in 3 seconds...`);
                setTimeout(connectToPeer, 3000);
            });
        };

        connectToPeer();
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

// Main Execution
if (process.argv.length < 3) {
    console.error('Usage: node peer.js <peersIps>');
    process.exit(1);
}

const peersIps = process.argv.slice(2);

/**
 * Get the local IP address of the machine.
 * 
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
const selfIpAddress = getOwnIP().toString();

(async () => {
    startPeerServer('0.0.0.0', 3000);

    // Setup persistent connections to other peers.
    for (const peer of peersIps) {
        socketArray.push(await setupPersistentSocket(peer, 3000, `PeerSocket`));
    }

    startAntiEntropy();
})();
