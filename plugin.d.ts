export type SharedWorker <Data = unknown> = {
	publish (data: Data): PublishedMessage<Data>;
	ref (): void;
	subscribe (): AsyncIterableIterator<ReceivedMessage<Data>>;
	unref (): void;
};

export type PublishedMessage<Data = unknown> = {
	readonly id: string;
	reply: Promise<ReceivedMessage<Data>>;
};

export type ReceivedMessage<Data = unknown> = {
	readonly data: Data;
	readonly id: string;
	reply (data: Data): PublishedMessage<Data>;
};

export function registerSharedWorker <Data = unknown> (options: {
	filename: string;
	initialOptions?: unknown;
	teardown (worker: SharedWorker<Data>): void;
}): SharedWorker<Data>;
