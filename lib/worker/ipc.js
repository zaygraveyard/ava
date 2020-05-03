'use strict';
const v8 = require('v8');
const Emittery = require('emittery');

const emitter = new Emittery();
process.on('message', message => {
	if (!message.ava) {
		return;
	}

	switch (message.ava.type) {
		case 'options':
			emitter.emit('options', message.ava.options);
			break;
		case 'peer-failed':
			emitter.emit('peerFailed');
			break;
		case 'pong':
			emitter.emit('pong');
			break;
		case 'pass-shared-worker-message':
			emitter.emit('pass-shared-worker-message', message.ava);
			break;
		case 'shared-worker-ready':
			emitter.emit('shared-worker-ready', message.ava);
			break;
		case 'shared-worker-error':
			emitter.emit('shared-worker-error', message.ava);
			break;
		default:
			break;
	}
});

exports.options = emitter.once('options');
exports.peerFailed = emitter.once('peerFailed');

function send(evt) {
	if (process.connected) {
		process.send({ava: evt});
	}
}

exports.send = send;

let refs = 1;
function ref() {
	if (++refs === 1) {
		process.channel.ref();
	}
}

function unref() {
	if (refs > 0 && --refs === 0) {
		process.channel.unref();
	}
}

exports.unref = unref;

let pendingPings = Promise.resolve();
async function flush() {
	ref();
	const promise = pendingPings.then(async () => { // eslint-disable-line promise/prefer-await-to-then
		send({type: 'ping'});
		await emitter.once('pong');
		if (promise === pendingPings) {
			unref();
		}
	});
	pendingPings = promise;
	await promise;
}

exports.flush = flush;

// TODO: On supported Node.js versions, use an advanced IPC to avoid the
// explicit (de)serialization.
const deserializeData = evt => v8.deserialize(Uint8Array.from(evt.data));
const serializeData = data => [...v8.serialize(data)];

let channelCounter = 0;
let messageCounter = 0;

function registerSharedWorker(filename, initialOptions) {
	const channelId = ++channelCounter;

	ref();
	send({
		type: 'register-shared-worker',
		channelId,
		options: serializeData({filename, initialOptions})
	});

	let error = null;
	const disposeError = emitter.on('shared-worker-error', evt => {
		if (evt.channelId === channelId) {
			error = new Error('The shared worker is no longer available');
			disposeError();
		}
	});

	let queue = [];

	return {
		ready: new Promise(resolve => {
			const disposeReady = emitter.on('shared-worker-ready', evt => {
				if (evt.channelId !== channelId) {
					return;
				}

				disposeReady();
				unref();
				resolve();

				for (const message of queue) {
					send({
						type: 'pass-shared-worker-message',
						channelId,
						...message
					});
				}

				queue = null;
			});
		}),

		channel: {
			deserializeData,
			ref,
			unref,

			async * receive() {
				if (error !== null) {
					throw error;
				}

				for await (const evt of emitter.events('pass-shared-worker-message')) {
					if (evt.channelId !== channelId) {
						continue;
					}

					if (error !== null) {
						throw error;
					}

					yield evt;

					if (error !== null) {
						throw error;
					}
				}
			},

			post(data, replyTo) {
				if (data === undefined) {
					throw new TypeError('Cannot publish undefined data');
				}

				if (error !== null) {
					throw error;
				}

				const messageId = ++messageCounter;
				data = serializeData(data);
				if (queue === null) {
					send({
						type: 'pass-shared-worker-message',
						channelId,
						messageId,
						replyTo,
						data
					});
				} else {
					queue.push({messageId, replyTo, data});
				}

				return messageId;
			}
		}
	};
}

exports.registerSharedWorker = registerSharedWorker;

