import net from 'net';
import { log, error, rl } from '../utils.js';

type CommandObject = {
    host: string, 
    port:number,
    op: string,
    num1: number, 
    num2: number,
    representation: string
}

export class Server {
    host: string;
    port: number;
    server: net.Server | null;
    
    constructor(host: string, port: number){
        this.host = host;
        this.port = port;
        this.server = null;
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = net.createServer((socket) => {
                    const clientAddress = socket.remoteAddress;
                    const clientPort = socket.remotePort;

                    log('Server', `New connection from ${clientAddress}:${clientPort}`);

                    socket.on('data', (data) => {
                        const command: CommandObject = JSON.parse(data.toString().trim());
                        log('Server',`Received command ${command.representation} from ${clientAddress}:${clientPort}`);

                        // Process the command
                        this.processCommand(command);
                    });
        
                    socket.on('end', () => {
                        log('Server',`Client ${clientAddress}:${clientPort} disconnected from server`);
                    });
                });
        
                this.server.listen(this.port, this.host, () => {
                    log('Server',`Listening on ${this.host}:${this.port}`);
                    resolve();
                });
            }
            catch (err: unknown) {
                if (err instanceof Error) {
                    error('Server', err.message);
                }
                else {
                    error('Server', String(err));
                }
                reject();
            }
        })
    }

    processCommand(command: CommandObject): void {
        log('Server', `Received command ${command.representation}`);
    }
}

export class Client {
    host: string;

    constructor(host: string) {
        this.host = host;
    }

    async start() {
        log('Client','Running...');
        while (true) {
            try {
                const command = await this.question('$ ');
                const parsedCommand = this.parseCommand(command);
                const result = await this.sendCommand(parsedCommand);

                log('Client', `Result: ${result}`);
            } catch (err: unknown) {
                if (err instanceof Error) {
                    error('Client', err.message);
                }
                else {
                    error('Client', String(err));
                }
            }
        }
    }

    question(prompt: string): Promise<string> {
        return new Promise((resolve) => rl.question(prompt, resolve));
    }

    parseCommand(command: string): CommandObject {
        const [host, port, op, num1, num2] = command.split(' ');
        if (!host || !port ||! op || !num1 || !num2) {
            throw new Error('Invalid command format. Example: 127.0.0.1 8080 add 2 3');
        }
        return { host, port: parseInt(port), op, num1: parseFloat(num1), num2: parseFloat(num2), representation: command };
    }

    // Sends a command to the server and retrieves the result
    sendCommand(command: CommandObject) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();

            socket.connect(command.port, command.host, () => {
                log('Client',`Connected to server ${host}:${port}`);
                socket.write(`${JSON.stringify(command)}\n`);
            });

            socket.on('data', (data) => {
                const result = parseFloat(data.toString().trim());
                socket.end();
                resolve(result);
            });

            socket.on('error', (err) => {
                reject(err);
            });

            socket.on('end', () => {
                log('Client',`Connection closed`);
            });
        });
    }
}

export class Peer {
    host: string;
    port: number;

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;
    }

    // Start both the client and the server
    async start() {
        // Instantiate server
        const server = new Server(this.host, this.port);
        // Start server
        await server.start();
        // Initialize and start Client
        new Client(this.host).start();
    }
}

// Usage

// Get arguments from command line
const [host, port] = process.argv.slice(2);
if (host && port) {    
    const peer = new Peer(host, parseInt(port));
    peer.start();
}
else{
    error('App','Missing arguments');
}