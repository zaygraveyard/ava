const {Worker} = require('worker_threads'); // eslint-disable-line node/no-unsupported-features/node-builtins
const pEvent = require('p-event');

const workers = new Map();

function register({filename, initialOptions}) {
	if (workers.has(filename)) {
		return workers.get(filename);
	}

	// TODO: Handle 'error' and 'exit'.
	const worker = new Worker(filename, {workerData: initialOptions});
	const result = {
		worker,
		online: pEvent(worker, 'online')
	};
	workers.set(filename, result);
	return result;
}

function addTestWorker(testWorker) {
	testWorker.onSharedWorker(channel => {
		const {worker: sharedWorker, online} = register(channel.options);

		online.then(() => channel.signalReady()); // eslint-disable-line promise/prefer-await-to-then

		sharedWorker.on('message', async message => {
			// FIXME: Allow messages to be broadcast to all test workers, or sent to a
			// specific worker.
			channel.postMessage(message);
		});

		channel.on('message', message => {
			sharedWorker.postMessage(message);
		});
	});
}

exports.addTestWorker = addTestWorker;

async function shutdown() {
	await Promise.all([...workers.values()].map(worker => worker.worker.terminate()));
}

exports.shutdown = shutdown;
