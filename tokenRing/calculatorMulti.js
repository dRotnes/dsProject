const net = require('net');

let numberOfConnections = 0;

// Function to start the server
function startServer(ipAddress, port) {
    const server = net.createServer((clientSocket) => {
        const clientAddress = clientSocket.remoteAddress;
        const clientPort = clientSocket.remotePort;

        console.log(`\nNew connection from ${clientAddress}:${clientPort}`);
        numberOfConnections += 1;

        // Handle client messages
        clientSocket.on('data', (data) => {
            const command = JSON.parse(data.toString());
            console.log(`Received command from: ${clientAddress}: ${command.operation} ${command.number1} ${command.number2}`)
            const result = processCommand(command);
            clientSocket.write(result);
        });

        // Handle client disconnect
        clientSocket.on('end', () => {
            console.log(`Connection from ${clientAddress}:${clientPort} closed.`);
            numberOfConnections -= 1;
            if(numberOfConnections <= 0) {
                console.log('\nNo active connections. Server shutting down.');
                server.close();
                process.exit(0);
            }
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
if (process.argv.length < 2) {
    console.error('Usage: node calculatorServer.js');
    process.exit(1);
}
startServer('0.0.0.0', 3030);