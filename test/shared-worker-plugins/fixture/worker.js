// TODO: Negotiate a protocol with AVA.

const {parentPort} = require('worker_threads'); // eslint-disable-line node/no-unsupported-features/node-builtins

let stored;
parentPort.on('message', message => {
	if (message.type === 'store') {
		stored = message.value;
	} else if (message.type === 'retrieve') {
		parentPort.postMessage({id: message.id, value: stored});
	}
});
