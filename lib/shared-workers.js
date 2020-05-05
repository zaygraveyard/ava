const {Worker} = require('worker_threads'); // eslint-disable-line node/no-unsupported-features/node-builtins
const pEvent = require('p-event');

const provider = require.resolve('./shared-worker-provider');

const launchedWorkers = new Map();

function launchWorker({filename, initialData}) {
	if (launchedWorkers.has(filename)) {
		return launchedWorkers.get(filename);
	}

	const worker = new Worker(provider, {workerData: {filename, initialData}});
	const launched = {
		available: pEvent(worker, 'message', ({type}) => type === 'available'),
		error: pEvent(worker, 'error', {rejectionEvents: []}),
		worker
	};

	launchedWorkers.set(filename, launched);
	worker.once('exit', () => launchedWorkers.delete(filename));

	return launched;
}

let testWorkerCounter = 0;

function addTestWorker(testWorker) {
	const id = ++testWorkerCounter;

	testWorker.onSharedWorker(async channel => {
		const launched = launchWorker(channel);

		launched.error.then(error => { // eslint-disable-line promise/prefer-await-to-then
			// TODO: Report error to user.
			console.error(error);
			channel.signalError();
		});

		await launched.available;
		launched.worker.postMessage({
			type: 'register-test-worker',
			id,
			file: testWorker.file
		});

		testWorker.promise.finally(() => {
			launched.worker.postMessage({
				type: 'deregister-test-worker',
				id
			});
		});

		launched.worker.on('message', async message => {
			if (message.type === 'broadcast' || (message.type === 'message' && message.testWorkerId === id)) {
				const {messageId, replyTo, data} = message;
				channel.postMessage({messageId, replyTo, data});
			}
		});

		channel.on('message', ({messageId, replyTo, data}) => {
			launched.worker.postMessage({
				type: 'message',
				testWorkerId: id,
				messageId,
				replyTo,
				data
			});
		});

		channel.signalReady();
	});
}

exports.addTestWorker = addTestWorker;

async function shutdown() {
	await Promise.all([...launchedWorkers.values()].map(worker => worker.worker.terminate()));
}

exports.shutdown = shutdown;
