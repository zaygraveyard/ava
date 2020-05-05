const {EventEmitter} = require('events');
const {workerData, parentPort} = require('worker_threads'); // eslint-disable-line node/no-unsupported-features/node-builtins
const pDefer = require('p-defer');
const pEvent = require('p-event');
const pkg = require('../package.json');

const makeWorker = require(workerData.filename);

let fatal;
Promise.resolve(makeWorker({
	negotiateProtocol(supported) {
		if (!supported.includes('experimental')) {
			fatal = new Error(`This version of AVA (${pkg.version}) is not compatible with shared worker plugin at ${workerData.filename}`);
			throw fatal;
		}

		class ReceivedMessage {
			constructor(testWorker, id, data) {
				this.testWorker = testWorker;
				this.id = id;
				this.data = data;
			}

			reply(data) {
				return postMessage(this.testWorker, data, this.id);
			}
		}

		let messageCounter = 0;
		// Ensure that, no matter how often it's received, we have a stable message
		// object.
		const messageCache = new WeakMap();
		async function * receiveMessages(testWorker, replyTo) {
			for await (const evt of pEvent.iterator(parentPort, 'message')) {
				if (evt.type !== 'message') {
					continue;
				}

				if (testWorker !== undefined && evt.testWorkerId !== testWorker.id) {
					continue;
				}

				if (replyTo === undefined && evt.replyTo !== undefined) {
					continue;
				}

				if (replyTo !== undefined && evt.replyTo !== replyTo) {
					continue;
				}

				let message = messageCache.get(evt);
				if (message === undefined) {
					message = new ReceivedMessage(testWorkers.get(evt.testWorkerId).testWorker, evt.messageId, evt.data);
					messageCache.set(evt, message);
				}

				yield message;
			}
		}

		function postMessage(testWorker, data, replyTo) {
			const id = ++messageCounter;
			parentPort.postMessage({
				type: 'message',
				messageId: id,
				testWorkerId: testWorker.id,
				data,
				replyTo
			});

			return {
				id,

				get reply() {
					return new Promise((resolve, reject) => {
						const iterator = receiveMessages(testWorker, id);
						iterator.next()
							.then(({value}) => resolve(value), reject) // eslint-disable-line promise/prefer-await-to-then
							.finally(() => {
								iterator.return();
							});
					});
				}
			};
		}

		const events = new EventEmitter();
		const testWorkers = new Map();

		class TestWorker {
			constructor(id, file, finished) {
				this.id = id;
				this.file = file;
				this.finished = finished;
			}

			publish(data) {
				return postMessage(this, data);
			}

			subscribe() {
				return receiveMessages(this);
			}
		}

		parentPort.on('message', message => {
			if (message.type === 'register-test-worker') {
				const {id, file} = message;
				const finished = pDefer();
				const testWorker = new TestWorker(id, file, finished.promise);

				testWorkers.set(id, {
					finish: finished.resolve,
					testWorker
				});

				events.emit('testWorker', testWorker);
			}

			if (message.type === 'deregister-test-worker') {
				const {id} = message;
				testWorkers.get(id).finish();
				testWorkers.delete(id);
			}
		});

		return {
			protocol: 'experimental',
			testWorkers: pEvent.iterator(events, 'testWorker'),

			broadcast(data) {
				const messageId = ++messageCounter;
				parentPort.postMessage({
					type: 'broadcast',
					messageId,
					data
				});
				return messageId;
			},

			subscribe() {
				return receiveMessages();
			}
		};
	}
})).catch(error => {
	process.nextTick(() => {
		throw error;
	});
});

if (fatal !== undefined) {
	throw fatal;
}

parentPort.postMessage({type: 'available'});
