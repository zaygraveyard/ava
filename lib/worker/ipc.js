'use strict';
const Emittery = require('emittery');

const {deserializeData, serializeData} = require('../data-serialization');

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

let channelCounter = 0;
let messageCounter = 0;

function registerSharedWorker(filename, initialData) {
	const channelId = ++channelCounter;

	let forcedUnref = false;
	let refs = 0;
	const forceUnref = () => {
		if (forcedUnref) {
			return;
		}

		forcedUnref = true;
		if (refs > 0) {
			unref();
		}
	};

	const refManagement = {
		ref() {
			if (!forcedUnref && ++refs === 1) {
				ref();
			}
		},

		unref() {
			if (!forcedUnref && refs > 0 && --refs === 0) {
				unref();
			}
		}
	};

	refManagement.ref();
	send({
		type: 'register-shared-worker',
		channelId,
		filename,
		initialData: serializeData(initialData)
	});

	let available = false;

	let error = null;
	const disposeError = emitter.on('shared-worker-error', evt => {
		if (evt.channelId === channelId) {
			error = new Error('The shared worker is no longer available');
			disposeError();
			forceUnref();
		}
	});

	return {
		ready: new Promise(resolve => {
			const disposeReady = emitter.on('shared-worker-ready', evt => {
				if (evt.channelId !== channelId) {
					return;
				}

				available = true;
				refManagement.unref();

				disposeReady();
				resolve();
			});
		}),

		forceUnref,

		channel: {
			deserializeData,

			...refManagement,

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
				if (error !== null) {
					throw error;
				}

				if (!available) {
					throw new Error('Shared worker is not yet available');
				}

				const messageId = ++messageCounter;
				send({
					type: 'pass-shared-worker-message',
					channelId,
					messageId,
					replyTo,
					data: serializeData(data)
				});

				return messageId;
			}
		}
	};
}

exports.registerSharedWorker = registerSharedWorker;

