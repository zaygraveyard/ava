export type SharedWorker <Data = unknown> = {
	available: boolean;
	publish (data: Data): PublishedMessage<Data>;
	ref (): void;
	subscribe (): AsyncIterableIterator<ReceivedMessage<Data>>;
	unref (): void;
};

export type PublishedMessage<Data = unknown> = {
	readonly id: string;
	channel: AsyncIterableIterator<ReceivedMessage<Data>>;
	reply: Promise<ReceivedMessage<Data>>;
};

export type ReceivedMessage<Data = unknown> = {
	readonly data: Data;
	readonly id: string;
	reply (data: Data): PublishedMessage<Data>;
};

export function registerSharedWorker <Data = unknown> (options: { filename: string; initialOptions?: any }): SharedWorker<Data>;
