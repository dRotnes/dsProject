import readline from 'readline';
export const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

export default {
    log: log,
    error: error,
}

export function log(label: string, message: string){
    console.log(label + ':', message);
}
export function error(label: string, message: string){
    console.error(label + ':', message);
}