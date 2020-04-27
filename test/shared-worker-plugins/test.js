const test = require('@ava/stable');
const exec = require('../helper/exec');

test('shared worker plugins work', async t => {
	const result = await exec.fixture();
	t.snapshot(result.stats.passed);
});
