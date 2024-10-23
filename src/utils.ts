import * as readline from 'readline';
import * as net from 'net';

export type CommandObject = {
    host: string, 
    port:number,
    op: string,
    num1: number, 
    num2: number,
    representation: string
}

export function log(label: string, message: string){
    console.log(label + ':', message);
}
export function error(label: string, message: string){
    console.error(label + ':', message);
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
        try {
            this.server = net.createServer((clientSocket) => {
                const clientAddress = 
                clientSocket.remoteAddress;
                const clientPort = 
                clientSocket.remotePort;

                const rl = readline.createInterface({
                    input: 
                    clientSocket,
                    output: 
                    clientSocket,
                    terminal: false
                });

                rl.on('line', (message) => {
                    const command: CommandObject = JSON.parse(message);
                    log('Server', `Message from ${clientAddress}:${clientPort} [command: ${command.representation}]`);

                    const result = this.processCommand(command);
                    
                    clientSocket.write(`${result}\n`);
                    rl.close();
                    clientSocket.end();
                });

                rl.on('close', () => {
                    log('Server',`Connection to ${clientAddress}:${clientPort} closed`);
                });
            });
    
            this.server.listen(this.port, this.host, () => {
                log('Server',`Listening on ${this.host}:${this.port}`);
            });
        }
        catch (err) {
            error('Server', (err as Error).message);
        }
    }

    processCommand(command: CommandObject): number | string {
        log('Server', JSON.stringify(command));
        const { op, num1, num2 } = command;
        let result;
        switch(op){
            case 'add':
                result = num1+num2;
                break;
            case 'sub':
                result = num1-num2;
                break;
            case 'mul':
                result = num1*num2;
                break;
            case 'div':
                result = num1/num2;
                break;
            default:
                result = 'Invalid operation';
        }
        return result;
    }
}

export class Client {
    host: string;

    constructor(host: string) {
        this.host = host;
    }

    async start() {
        log('Client','Running...');
        // eslint-disable-next-line no-constant-condition
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
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
        }));
    }

    parseCommand(command: string): CommandObject {
        const [host, port, op, num1, num2] = command.split(' ');
        if (!host || !port ||! op || !num1 || !num2) {
            throw new Error('Invalid command format. Example: 127.0.0.1 8080 add 2 3');
        }
        return { host, port: parseInt(port), op, num1: parseFloat(num1), num2: parseFloat(num2), representation: `${op} ${num1} ${num2}` };
    }

    // Sends a command to the server and retrieves the result
    sendCommand(command: CommandObject) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();

            socket.connect(command.port, command.host, () => {
                log('Client',`Connected to server ${command.host}:${command.port}`);
                socket.write(`${JSON.stringify(command)}\n`);
            });

            socket.on('data', (data) => {
                const result = data.toString().trim();
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
    start() {
        // Instantiate server
        new Server(this.host, this.port).start();
        // Initialize and start Client
        new Client(this.host).start();
    }
}

export default {
    Server,
    Client,
    Peer,
    log,
    error,
}