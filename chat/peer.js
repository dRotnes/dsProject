const net = require('net');
const os = require('os');
const fs = require('fs');
const process = require('process');
const { PriorityQueue } = require('@datastructures-js/priority-queue');

// The Lambda for the poisson distribution. 1 = 60/60 (60 per minute =  1 per second).
const lambda = 4 / 60;
// The Lamport Clock.
let lamportClock = 0;
// The priprity queue. Orders by clock first and in case of conflict, by the peer ip.
const queue = new PriorityQueue((a, b) => {
    if (a.clock < b.clock) return -1;
    if (a.clock > b.clock) return 1;
    
    return a.peerIp < b.peerIp ? -1 : 1;  
});
// The neighbors map to hold the sockets to use.
const neighborsMap = new Map();

// The disctionary of words.
const wordsArray = [
    "Air Ball",
    "Alley-oop",
    "Assist",
    "Backboard",
    "Backcourt",
    "Bank Shot",
    "Baseline",
    "Bench",
    "Block",
    "Bounce Pass",
    "Box Out",
    "Charging",
    "Chest Pass",
    "Double Dribble",
    "Dribble",
    "Dunk",
    "Fast Break",
    "Field Goal",
    "Flagrant Foul",
    "Free Throw",
    "Full-Court Press",
    "Goaltending",
    "Half-Court",
    "Inbounds Pass",
    "Jump Ball",
    "Layup",
    "Man-to-Man Defense",
    "Offense",
    "Overtime",
    "Personal Foul",
    "Pivot",
    "Rebound",
    "Screen",
    "Shot Clock",
    "Slam Dunk",
    "Steal",
    "Technical Foul",
    "Three-Point Line",
    "Traveling",
    "Turnover",
    "Zone Defense"
];

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
            const messages = data.toString().trim().split('\n');
            messages.forEach((message) => {
                handleIncomingMessage(message);
            });
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
                    const messages = data.toString().trim().split('\n');
                    messages.forEach((message) => {
                        handleIncomingMessage(message);
                    });
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
 * Sends a shutdown message to all peers and closes their sockets.
 */
function gracefulShutdown() {
    console.log("Shutting down gracefully...");
    sendMessage('SHUTDOWN');
    neighborsMap.clear();
    process.exit(0);
}

/**
 * Handles incoming messages accordingly, implementing the TOM logic.
 * 
 * @param message - The message. 
 */
function handleIncomingMessage(message) {
    const { text, clock, peerIp } = JSON.parse(message);
    lamportClock = Math.max(lamportClock, clock) + 1;
    
    if (text === 'SHUTDOWN') {
        console.log("Received shutdown message from a peer.");
        process.exit(0);
    }

    if (text !== 'ACK') {
        // Send Ack if message is not an ack.
        sendMessage('ACK');
    }
    // Add to queue.
    queue.enqueue({ text, clock, peerIp });
    printMessages();
}

/**
 * Sends a message to all peers, including itself. If it's a shutdown message, shuts the socket aswell.
 * 
 * @param message - The message,
 */
function sendMessage(message) {
    const jsonMessage = JSON.stringify({ text: message, clock: lamportClock, peerIp: selfIp });
    neighborsMap.forEach((socket) => {
        console.log(socket.remoteAddress, socket.remotePort);
        socket.write(jsonMessage + '\n');
        if(message === 'SHUTDOWN'){
            socket.end();
        }
    });
}

/**
 * Prints the messages and logs it into a file.
 */
function printMessages() {
    // While the queue holds something from every peer.
    while (peersIps.every((peer) => queue.toArray().some((message) => message.peerIp === peer))) {
        const { text, peerIp } = queue.front();
        // Print messages if not an ACK.
        if (text !== 'ACK') {
            const logMessage = `${peerIp}: ${text}`;
            console.log(logMessage);
            writeMessageToFile(logMessage);
        }
        queue.pop();
    }
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
 * Periodically updates the peer map using Anti-Entropy.
 */
function startMessageSending() {
    const delay = getPoissonDelay(lambda);
    setTimeout(() => {
        lamportClock += 1;
        const randomWord = wordsArray[Math.floor(Math.random() * wordsArray.length)];
        sendMessage(randomWord);
        startMessageSending();
    }, delay * 1000);
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
 * Function to log messages in a file 
 * @param message - The message 
 */
function writeMessageToFile(message) {
    // Append the message to the log file.
    fs.appendFileSync(`messages_${selfIp}.log`, message + '\n', 'utf8');
}

// Register signal handlers for graceful shutdown
process.on('SIGINT', gracefulShutdown);  // Handle Ctrl+C
process.on('SIGTERM', gracefulShutdown); // Handle termination signals

// Main Execution
if (process.argv.length < 3) {
    console.error('Usage: node peer.js [peerIps]');
    process.exit(1);
}
const peersIps = process.argv.slice(2);
const selfIp = getOwnIP();

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
    startMessageSending();
})();