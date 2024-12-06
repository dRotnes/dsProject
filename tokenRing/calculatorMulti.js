const net = require('net');

// Function to start the server
function startServer(ipAddress, port) {
    const server = net.createServer((clientSocket) => {
        const clientAddress = clientSocket.remoteAddress;
        const clientPort = clientSocket.remotePort;

        console.log(`\nNew connection from ${clientAddress}:${clientPort}`);

        // Handle client messages
        clientSocket.on('data', (data) => {
            const command = JSON.parse(data.toString());
            const result = processCommand(command);
            clientSocket.write(result);
        });

        // Handle client disconnect
        clientSocket.on('end', () => {
            console.log(`Connection from ${clientAddress}:${clientPort} closed.`);
        });

        clientSocket.on('error', (err) => {
            console.error(`Error with client ${clientAddress}:${clientPort}:`, err.message);
        });
    });

    server.listen(port, ipAddress, () => {
        const address = server.address();
        console.log(`\nRunning server: host=${address.address} @ port=${address.port}`);
    });

    server.on('error', (err) => {
        console.error('Server error:', err.message);
    });
}

// Function to process the incoming command
function processCommand(command) {
    try {
        const { operation, number1, number2 } = command;
        const x = parseFloat(number1);
        const y = parseFloat(number2);

        if (isNaN(x) || isNaN(y)) {
            return JSON.stringify({ success: false, message: 'Invalid numbers' });
        }

        let result;
        switch (operation) {
            case 'add':
                result = { success: true, result: (x + y).toString() };
                break;
            case 'sub':
                result = { success: true, result: (x - y).toString() };
                break;
            case 'mul':
                result = { success: true, result: (x * y).toString() };
                break;
            case 'div':
                if (y !== 0) {
                    result = { success: true, result: (x / y).toString() };
                } else {
                    result = { success: false, message: 'Division by zero' };
                }
                break;
            default:
                result = { success: false, message: 'Unknown operation' };
        }

        return JSON.stringify(result);
    } catch (error) {
        return JSON.stringify({ success: false, message: error.message });
    }
}

// Main execution
if (process.argv.length < 3) {
    console.error('Usage: node calculatorServer.js <ipAddress>');
    process.exit(1);
}
const ipAddress = process.argv[2];
startServer(ipAddress, 3000);