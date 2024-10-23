// import net from 'net';
import Utils from '../utils.js';

// export class CalculatorMultiServer extends Server {

//     constructor(host: string, port: number) {
//         super(host, port);
//     }
//     processCommand(command: CommandObject): void {
//         log('Calculator Multi:','hello');    
//     }
// }

// Get arguments from command line
const [host, port] = process.argv.slice(2);
if (host && port) {    
    const peer = new Utils.Peer(host, parseInt(port));
    peer.start();
}
else{
    Utils.error('App','Missing arguments');
}