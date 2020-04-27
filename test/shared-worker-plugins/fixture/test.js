const crypto = require('crypto');
const test = require('ava');
const storeAndRetrieve = require('./helper');

const random = crypto.randomBytes(16);

test.serial('store', async t => {
	await t.notThrowsAsync(storeAndRetrieve.store(random));
});

test.serial('retrieve', async t => {
	t.deepEqual(Buffer.from(await storeAndRetrieve.retrieve()), random);
});
