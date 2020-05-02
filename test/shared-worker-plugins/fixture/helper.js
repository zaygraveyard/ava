const {registerSharedWorker} = require('ava/plugin');

const registration = registerSharedWorker({
	filename: require.resolve('./worker')
});

exports.store = async value => {
	const status = registration.publish({type: 'store', value});
	await status.response;
};

exports.retrieve = async () => {
	const status = registration.publish({type: 'retrieve'});
	const {data: value} = await status.response;
	return value;
};

exports.subscribe = async function * () {
	for await (const {data} of registration.subscribe()) {
		if (data.type === 'change') {
			yield data.value;
		}
	}
};
