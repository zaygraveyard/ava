const path = require('path');

const test = require('@ava/test');
const execa = require('execa');

const cliPath = path.resolve(__dirname, '../../cli.js');
const serialization = require('../../lib/data-serialization');

exports.fixture = async (...args) => {
	const cwd = path.join(path.dirname(test.meta.file), 'fixtures');
	const running = execa.node(cliPath, args, {
		env: {
			AVA_EMIT_RUN_STATUS_OVER_IPC: 'I\'ll find a payphone baby / Take some time to talk to you'
		},
		cwd,
		serialization: serialization.useAdvanced ? 'advanced' : 'json',
		stderr: 'inherit'
	});

	const stats = {
		passed: []
	};

	running.on('message', message => {
		message = serialization.deserializeData(message);

		switch (message.type) {
			case 'test-passed': {
				const {title, testFile} = message;
				stats.passed.push({title, file: path.posix.relative(cwd, testFile)});
				break;
			}

			default:
				break;
		}
	});

	try {
		return {
			stats,
			...await running
		};
	} catch (error) {
		throw Object.assign(error, {stats});
	} finally {
		stats.passed.sort((a, b) => {
			if (a.file < b.file) {
				return -1;
			}

			if (a.file > b.file) {
				return 1;
			}

			if (a.title < b.title) {
				return -1;
			}

			return 1;
		});
	}
};
