const pkg = require('../../package.json');
const subprocess = require('./subprocess');

const workers = new Map();
const workerTeardownFns = new WeakMap();

function createSharedWorker(filename, initialData, teardown) {
	const {channel} = subprocess.registerSharedWorker(filename, initialData, teardown);

	class ReceivedMessage {
		constructor(id, data) {
			this.id = id;
			this.data = data;
		}

		reply(data) {
			return postMessage(data, this.id);
		}
	}

	// Ensure that, no matter how often it's received, we have a stable message
	// object.
	const messageCache = new WeakMap();
	async function * receiveMessages(replyTo) {
		for await (const evt of channel.receive()) {
			if (replyTo === undefined && evt.replyTo !== undefined) {
				continue;
			}

			if (replyTo !== undefined && evt.replyTo !== replyTo) {
				continue;
			}

			let message = messageCache.get(evt);
			if (message === undefined) {
				message = new ReceivedMessage(evt.messageId, channel.deserializeData(evt.data));
				messageCache.set(evt, message);
			}

			yield message;
		}
	}

	function postMessage(data, replyTo) {
		const id = channel.post(data, replyTo);

		return {
			id,

			get reply() {
				return new Promise((resolve, reject) => {
					channel.ref();
					const iterator = receiveMessages(id);
					iterator.next()
						.then(({value}) => resolve(value), reject) // eslint-disable-line promise/prefer-await-to-then
						.finally(() => {
							iterator.return();
							channel.unref();
						});
				});
			}
		};
	}

	return {
		ref: channel.ref,
		unref: channel.unref,

		publish(data) {
			return postMessage(data);
		},

		async * subscribe() {
			channel.ref();
			try {
				for await (const message of receiveMessages()) {
					yield message;
				}
			} finally {
				channel.unref();
			}
		}
	};
}

function registerSharedWorker({
	filename,
	initialData,
	supportedProtocols,
	teardown
}) {
	if (!supportedProtocols.includes('experimental')) {
		throw new Error(`This version of AVA (${pkg.version}) does not support any of desired shared worker protocols: ${supportedProtocols.join()}`);
	}

	let worker = workers.get(filename);
	if (worker === undefined) {
		worker = createSharedWorker(filename, initialData, async () => {
			if (workerTeardownFns.has(worker)) {
				await Promise.all(workerTeardownFns.get(worker).map(fn => fn()));
			}
		});
		workers.set(filename, worker);
	}

	if (teardown !== undefined) {
		if (workerTeardownFns.has(worker)) {
			workerTeardownFns.get(worker).push(teardown);
		} else {
			workerTeardownFns.set(worker, [teardown]);
		}
	}

	return {...worker, protocol: 'experimental'};
}

exports.registerSharedWorker = registerSharedWorker;
