// FIXME: Only load in Node.js 12 and newer!
const v8 = require('v8');
const {Worker} = require('worker_threads'); // eslint-disable-line node/no-unsupported-features/node-builtins
const pEvent = require('p-event');

const workers = new Map();

async function register(id, options) {
	if (workers.has(id)) {
		return workers.get(id);
	}

	// TODO: Handle 'error' and 'exit'.
	const worker = new Worker(options.filename);
	workers.set(id, worker);
	await pEvent(worker, 'online');
	return worker;
}

const ONLINE = v8.serialize('online').toString('base64');

function addTestWorker(fork) {
	fork.onRegisterSharedWorker(async ({channelId, workerId, options}) => {
		const worker = await register(workerId, options);
		worker.on('message', async value => {
			// TODO: Allow messages to be broadcast to all test workers, or sent to a
			// specific worker.

			fork.passSharedWorkerMessage({
				channelId,
				value: v8.serialize(value).toString('base64')
			});
		});

		fork.onPassSharedWorkerMessage(({channelId: dest, value}) => {
			if (channelId === dest) {
				worker.postMessage(value);
			}
		});

		fork.passSharedWorkerMessage({
			channelId,
			value: ONLINE
		});
	});
}

exports.addTestWorker = addTestWorker;

async function shutdown() {
	await Promise.all([...workers.values()].map(worker => worker.terminate()));
}

exports.shutdown = shutdown;
