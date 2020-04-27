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

function createWorkerChannel({id: workerId, worker}) {
	const channelId = channelCounter++;
	send({
		type: 'register-shared-worker',
		channelId,
		workerId,
		options: worker
	});

	return {
		postMessage(value) {
			send({
				type: 'pass-shared-worker-message',
				channelId,
				workerId,
				value: v8.serialize(value).toString('base64')
			});
		},

		onMessage(callback) {
			return emitter.on('pass-shared-worker-message', evt => {
				if (evt.channelId !== channelId) {
					return;
				}

				// TODO: If there are multiple message callbacks registered, we shouldn't
				// deserialize more than once.
				const value = v8.deserialize(Buffer.from(evt.value, 'base64'));
				callback(value);
			});
		},

		ref,
		unref
	};
}

exports.createWorkerChannel = createWorkerChannel;
