'use strict';
const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const Emittery = require('emittery');

if (fs.realpathSync(__filename) !== __filename) {
	console.warn('WARNING: `npm link ava` and the `--preserve-symlink` flag are incompatible. We have detected that AVA is linked via `npm link`, and that you are using either an early version of Node 6, or the `--preserve-symlink` flag. This breaks AVA. You should upgrade to Node 6.2.0+, avoid the `--preserve-symlink` flag, or avoid using `npm link ava`.');
}

// In case the test file imports a different AVA install,
// the presence of this variable allows it to require this one instead
const AVA_PATH = path.resolve(__dirname, '..');

const workerPath = require.resolve('./worker/subprocess');

class SharedWorkerChannel extends Emittery {
	constructor({channelId, options}, send) {
		super();

		this.id = channelId;
		this.options = v8.deserialize(Uint8Array.from(options));
		this.send = send;
	}

	signalReady() {
		this.send({
			type: 'shared-worker-ready',
			channelId: this.id
		});
	}

	signalError() {
		this.send({
			type: 'shared-worker-error',
			channelId: this.id
		});
	}

	receiveMessage({messageId, replyTo, data}) {
		this.emit('message', {
			channelId: this.id,
			messageId,
			replyTo,
			data: v8.deserialize(Uint8Array.from(data))
		});
	}

	postMessage({messageId, replyTo, data}) {
		this.send({
			type: 'pass-shared-worker-message',
			channelId: this.id,
			messageId,
			replyTo,
			data: [...v8.serialize(data)]
		});
	}
}

module.exports = (file, options, execArgv = process.execArgv) => {
	let finished = false;

	const emitter = new Emittery();
	const emitStateChange = evt => {
		if (!finished) {
			emitter.emit('stateChange', Object.assign(evt, {testFile: file}));
		}
	};

	options = {
		file,
		baseDir: process.cwd(),
		...options
	};

	const subprocess = childProcess.fork(workerPath, options.workerArgv, {
		cwd: options.projectDir,
		silent: true,
		env: {NODE_ENV: 'test', ...process.env, ...options.environmentVariables, AVA_PATH},
		execArgv
	});

	subprocess.stdout.on('data', chunk => {
		emitStateChange({type: 'worker-stdout', chunk});
	});

	subprocess.stderr.on('data', chunk => {
		emitStateChange({type: 'worker-stderr', chunk});
	});

	let forcedExit = false;
	const send = evt => {
		if (subprocess.connected && !finished && !forcedExit) {
			subprocess.send({ava: evt}, () => {
				// Disregard errors.
			});
		}
	};

	const sharedWorkerChannels = new Map();

	const promise = new Promise(resolve => {
		const finish = () => {
			finished = true;
			resolve();
		};

		subprocess.on('message', message => {
			if (!message.ava) {
				return;
			}

			switch (message.ava.type) {
				case 'ready-for-options':
					send({type: 'options', options});
					break;
				case 'register-shared-worker': {
					const channel = new SharedWorkerChannel(message.ava, send);
					sharedWorkerChannels.set(channel.id, channel);
					emitter.emit('sharedWorker', channel);
					break;
				}

				case 'pass-shared-worker-message':
					sharedWorkerChannels.get(message.ava.channelId).receiveMessage(message.ava);
					break;
				case 'ping':
					send({type: 'pong'});
					break;
				default:
					emitStateChange(message.ava);
			}
		});

		subprocess.on('error', err => {
			emitStateChange({type: 'worker-failed', err});
			finish();
		});

		subprocess.on('exit', (code, signal) => {
			if (forcedExit) {
				emitStateChange({type: 'worker-finished', forcedExit});
			} else if (code > 0) {
				emitStateChange({type: 'worker-failed', nonZeroExitCode: code});
			} else if (code === null && signal) {
				emitStateChange({type: 'worker-failed', signal});
			} else {
				emitStateChange({type: 'worker-finished', forcedExit});
			}

			finish();
		});
	});

	return {
		exit() {
			forcedExit = true;
			subprocess.kill();
		},

		notifyOfPeerFailure() {
			send({type: 'peer-failed'});
		},

		onSharedWorker(listener) {
			return emitter.on('sharedWorker', listener);
		},

		onStateChange(listener) {
			return emitter.on('stateChange', listener);
		},

		file,
		promise
	};
};
