const { parentPort } = require('worker_threads');

/**
 * Returns the delay to apply when creating the requests.
 * @param {number} lambda - The lambda to use as guideline.
 * @returns {number}
 */
function getPoissonDelay(lambda) {
    return -Math.log(1.0 - Math.random()) / lambda;
}

/**
 * Returns a random operation out of the options defined.
 * @returns {string}
 */
function getRandomOperation() {
    const operations = ['add', 'sub', 'mul', 'div'];
    return operations[Math.floor(Math.random() * operations.length)];
}

/**
 * Returns two random numbers.
 * @returns {{ number1: number, number2: number }}
 */
function getRandomArguments() {
    return { number1: Math.floor(Math.random() * 100), number2: Math.floor(Math.random() * 100) };
}

/**
 * Generates random requests and sends them to the main thread.
 * @param {number} lambda - The lambda to use as guideline.
 */
function generateRequests(lambda) {
    const delay = getPoissonDelay(lambda);
    setTimeout(() => {
        const operation = getRandomOperation();
        const { number1, number2 } = getRandomArguments();
        const request = { operation, number1, number2 };

        // Send the generated request to the main thread
        parentPort.postMessage(request);

        // Schedule the next request generation
        generateRequests(lambda);
    }, delay * 1000);
}

// Start generating requests with the provided lambda
parentPort.on('message', (lambda) => {
    generateRequests(lambda);
});