const v8 = require('v8');

// TODO: On supported Node.js versions, use an advanced IPC to avoid the
// explicit (de)serialization.
const deserializationCache = new WeakMap();
const deserialize = evt => {
	if (deserializationCache.has(evt)) {
		return deserializationCache.get(evt);
	}

	const data = v8.deserialize(new Uint8Array(evt.data.data));
	deserializationCache.set(evt, data);
	return data;
};

const serialize = data => v8.serialize(data);

let channelCounter = 0;
const workers = new Map();

function registerSharedWorker({
	filename,
	initialOptions
}) {
	if (workers.has(filename)) {
		return workers.get(filename);
	}

	const ipc = require('./lib/worker/ipc');
	const channelId = ++channelCounter;

	// TODO: Implement IPC signal for when the worker is and is not available.
	const available = false;
	ipc.send({
		type: 'register-shared-worker',
		channelId,
		options: serialize({filename, initialOptions})
	});

	class Message {
		constructor(id, data) {
			this.id = id;
			this.data = data;
		}

		reply(data) {
			return postMessage(data, this.id);
		}
	}

	async function * receiveMessages(replyTo) {
		for await (const evt of ipc.events('pass-shared-worker-message')) {
			if (evt.channelId !== channelId) {
				continue;
			}

			if (replyTo === undefined && evt.replyTo !== undefined) {
				continue;
			}

			if (replyTo !== undefined && evt.replyTo !== replyTo) {
				continue;
			}

			yield new Message(evt.messageId, deserialize(evt));
		}
	}

	let messageCounter = 0;
	function postMessage(data, replyTo) {
		if (!available) {
			throw new ReferenceError('Worker is not yet, or no longer, available');
		}

		if (data === undefined) {
			throw new TypeError('Cannot publish undefined data');
		}

		const id = ++messageCounter;
		ipc.send({
			type: 'pass-shared-worker-message',
			channelId,
			messageId: id,
			replyTo,
			data: serialize(data)
		});

		return {
			id,

			get channel() {
				return receiveMessages(id);
			},

			get reply() {
				return new Promise((resolve, reject) => {
					const iterator = receiveMessages(id);
					iterator.next()
						.then(({value}) => resolve(value), reject) // eslint-disable-line promise/prefer-await-to-then
						.finally(() => iterator.return());
				});
			}
		};
	}

	const worker = {
		get available() {
			return available;
		},

		publish(data) {
			return postMessage(data);
		},

		ref() {
			ipc.ref();
		},

		subscribe() {
			return receiveMessages();
		},

		unref() {
			ipc.unref();
		}
	};

	workers.set(filename, worker);
	return worker;
}

exports.registerSharedWorker = registerSharedWorker;
