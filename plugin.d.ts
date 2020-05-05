import {Except} from 'type-fest';

export namespace SharedWorker {
	export const enum ProtocolIdentifier {
		Experimental = 'experimental'
	}

	export type TestWorker = {
		readonly file: string;
		readonly finished: Promise<void>;
		publish (data: Data): PublishedMessage<Data>;
		subscribe (): AsyncIterableIterator<ReceivedMessage<Data>>;
	};

	export type Factory = (options: {
		negotiateProtocol <Data = unknown> (supported: ProtocolIdentifier[]): Protocol<Data>;
	}) => void;

	export type Protocol <Data = unknown> = {
		readonly protocol: ProtocolIdentifier.Experimental;
		readonly testWorkers: AsyncIterableIterator<TestWorker>;
		broadcast (data: Data): Except<PublishedMessage<Data>, 'reply'>;
		subscribe (): AsyncIterableIterator<ReceivedMessage<Data>>;
	};

	export type PublishedMessage<Data = unknown> = {
		readonly id: string;
		readonly reply: Promise<ReceivedMessage<Data>>;
	};

	export type ReceivedMessage<Data = unknown> = {
		readonly data: Data;
		readonly id: string;
		readonly testWorker: TestWorker;
		reply (data: Data): PublishedMessage<Data>;
	};

	export namespace Plugin {
		export type PublishedMessage<Data = unknown> = {
			readonly id: string;
			readonly reply: Promise<ReceivedMessage<Data>>;
		};

		export type ReceivedMessage<Data = unknown> = {
			readonly data: Data;
			readonly id: string;
			reply (data: Data): PublishedMessage<Data>;
		};

		export type Protocol <Data = unknown> = {
			readonly protocol: ProtocolIdentifier.Experimental;
			publish (data: Data): PublishedMessage<Data>;
			ref (): void;
			subscribe (): AsyncIterableIterator<ReceivedMessage<Data>>;
			unref (): void;
		};
	}
}

export function registerSharedWorker <Data = unknown> (options: {
	filename: string;
	initialData?: Data;
	supportedProtocols: SharedWorker.ProtocolIdentifier[];
	teardown (worker: SharedWorker<Data>): void;
}): SharedWorker.Plugin.Protocol<Data>;
