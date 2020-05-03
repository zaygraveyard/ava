const {registerSharedWorker} = require('ava/plugin');

const worker = registerSharedWorker({
	filename: require.resolve('./worker')
});

exports.store = async value => {
	const status = worker.publish({type: 'store', value});
	await status.reply;
};

exports.retrieve = async () => {
	const status = worker.publish({type: 'retrieve'});
	const {data: value} = await status.reply;
	return value;
};

exports.subscribe = async function * () {
	for await (const {data} of worker.subscribe()) {
		if (data.type === 'change') {
			yield data.value;
		}
	}
};
