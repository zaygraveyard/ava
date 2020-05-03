const subprocess = require('./subprocess');

const workers = new Map();
const workerTeardownFns = new WeakMap();

function createSharedWorker(filename, initialOptions, teardown) {
	const {channel} = subprocess.registerSharedWorker(filename, initialOptions, teardown);

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
				message = new ReceivedMessage(evt.messageId, channel.deserializeData(evt));
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

		subscribe() {
			return receiveMessages();
		}
	};
}

function registerSharedWorker({
	filename,
	initialOptions,
	teardown
}) {
	let worker = workers.get(filename);
	if (worker === undefined) {
		worker = createSharedWorker(filename, initialOptions, async () => {
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

	return worker;
}

exports.registerSharedWorker = registerSharedWorker;
