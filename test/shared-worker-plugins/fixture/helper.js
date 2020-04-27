const test = require('../../..');

const registration = test.meta.register({
	id: __filename,
	type: 'shared-worker',
	worker: {
		filename: require.resolve('./worker')
	}
});

exports.store = async value => {
	const shared = await registration;
	shared.postMessage({type: 'store', value});
};

let retrievalCounter = 0;
exports.retrieve = async () => {
	const id = retrievalCounter++;

	const shared = await registration;
	shared.postMessage({type: 'retrieve', id});

	let dispose;
	try {
		shared.ref();
		return await new Promise(resolve => {
			dispose = shared.onMessage(message => {
				if (message.id === id) {
					resolve(message.value);
				}
			});
		});
	} finally {
		shared.unref();
		dispose();
	}
};
