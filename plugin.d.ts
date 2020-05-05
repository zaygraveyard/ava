export namespace SharedWorkerPlugin {
	export type PublishedMessage<Data = unknown> = {
		readonly id: string;
		reply: Promise<ReceivedMessage<Data>>;
	};

	export type ReceivedMessage<Data = unknown> = {
		readonly data: Data;
		readonly id: string;
		reply (data: Data): PublishedMessage<Data>;
	};

	export const enum ProtocolIdentifier {
		Experimental = 'experimental'
	}

	export type Protocol <Data = unknown> = {
		protocol: ProtocolIdentifier.Experimental;
		publish (data: Data): PublishedMessage<Data>;
		ref (): void;
		subscribe (): AsyncIterableIterator<ReceivedMessage<Data>>;
		unref (): void;
	};
}

export function registerSharedWorker <Data = unknown> (options: {
	filename: string;
	initialData?: Data;
	protocols: SharedWorkerPlugin.ProtocolIdentifier[];
	teardown (worker: SharedWorker<Data>): void;
}): SharedWorkerPlugin.Protocol<Data>;
