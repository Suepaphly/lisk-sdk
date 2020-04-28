/*
 * Copyright © 2019 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { cloneDeep } from 'lodash';
import { ForkStatus } from '@liskhq/lisk-bft';
import { Chain, BlockInstance, BlockJSON } from '@liskhq/lisk-chain';
import { BaseTransaction } from '@liskhq/lisk-transactions';
import { Sequence } from '../utils/sequence';
import { Channel, Logger } from '../../../types';
import { BaseBlockProcessor } from './base_block_processor';

const forkStatusList = [
	ForkStatus.IDENTICAL_BLOCK,
	ForkStatus.VALID_BLOCK,
	ForkStatus.DOUBLE_FORGING,
	ForkStatus.TIE_BREAK,
	ForkStatus.DIFFERENT_CHAIN,
	ForkStatus.DISCARD,
];

interface ProcessorInput {
	readonly channel: Channel;
	readonly logger: Logger;
	readonly chainModule: Chain;
}

interface CreateInput {
	readonly keypair: { publicKey: Buffer; privateKey: Buffer };
	readonly timestamp: number;
	readonly transactions: BaseTransaction[];
	readonly previousBlock: BlockInstance;
	readonly seedReveal: string;
}

type Matcher = (block: BlockInstance | BlockJSON) => boolean;

export class Processor {
	private readonly channel: Channel;
	private readonly logger: Logger;
	private readonly chainModule: Chain;
	private readonly sequence: Sequence;
	private readonly processors: { [key: string]: BaseBlockProcessor };
	private readonly matchers: { [key: string]: Matcher };

	public constructor({ channel, logger, chainModule }: ProcessorInput) {
		this.channel = channel;
		this.logger = logger;
		this.chainModule = chainModule;
		this.sequence = new Sequence();
		this.processors = {};
		this.matchers = {};
	}

	// register a block processor with particular version
	public register(
		processor: BaseBlockProcessor,
		{ matcher }: { matcher?: Matcher } = {},
	): void {
		if (typeof processor.version !== 'number') {
			throw new Error('version property must exist for processor');
		}
		this.processors[processor.version] = processor;
		this.matchers[processor.version] = matcher ?? (() => true);
	}

	// eslint-disable-next-line no-unused-vars,class-methods-use-this
	public async init(genesisBlock: BlockInstance): Promise<void> {
		this.logger.debug(
			{ id: genesisBlock.id, payloadHash: genesisBlock.payloadHash },
			'Initializing processor',
		);
		// do init check for block state. We need to load the blockchain
		const blockProcessor = this._getBlockProcessor(genesisBlock);
		await this._processGenesis(genesisBlock, blockProcessor, {
			saveOnlyState: false,
		});
		await this.chainModule.init();
		const stateStore = await this.chainModule.newStateStore();
		for (const processor of Object.values(this.processors)) {
			await processor.init.run({ stateStore });
		}
		this.logger.info('Blockchain ready');
	}

	// Serialize a block instance to a JSON format of the block
	// eslint-disable-next-line @typescript-eslint/require-await
	public async serialize(blockInstance: BlockInstance): Promise<BlockJSON> {
		const blockProcessor = this._getBlockProcessor(blockInstance);
		return blockProcessor.serialize.run({ block: blockInstance });
	}

	// DeSerialize a block instance to a JSON format of the block
	// eslint-disable-next-line @typescript-eslint/require-await
	public async deserialize(blockJSON: BlockJSON): Promise<BlockInstance> {
		const blockProcessor = this._getBlockProcessor(blockJSON);
		return blockProcessor.deserialize.run({ block: blockJSON });
	}

	// process is for standard processing of block, especially when received from network
	public async process(
		block: BlockInstance,
		{ peerId }: { peerId?: string } = {},
	): Promise<void> {
		return this.sequence.add(async () => {
			this.logger.debug(
				{ id: block.id, height: block.height },
				'Starting to process block',
			);
			const blockProcessor = this._getBlockProcessor(block);
			const { lastBlock } = this.chainModule;
			const stateStore = await this.chainModule.newStateStore();

			const forkStatus = await blockProcessor.forkStatus.run({
				block,
				lastBlock,
			});

			if (!forkStatusList.includes(forkStatus)) {
				this.logger.debug(
					{ status: forkStatus, blockId: block.id },
					'Unknown fork status',
				);
				throw new Error('Unknown fork status');
			}

			// Discarding block
			if (forkStatus === ForkStatus.DISCARD) {
				this.logger.debug(
					{ id: block.id, height: block.height },
					'Discarding block',
				);
				const blockJSON = await this.serialize(block);
				this.channel.publish('app:chain:fork', { block: blockJSON });
				return;
			}
			if (forkStatus === ForkStatus.IDENTICAL_BLOCK) {
				this.logger.debug(
					{ id: block.id, height: block.height },
					'Block already processed',
				);
				return;
			}
			if (forkStatus === ForkStatus.DOUBLE_FORGING) {
				this.logger.warn(
					{ id: block.id, generatorPublicKey: block.generatorPublicKey },
					'Discarding block due to double forging',
				);
				const blockJSON = await this.serialize(block);
				this.channel.publish('app:chain:fork', { block: blockJSON });
				return;
			}
			// Discard block and move to different chain
			if (forkStatus === ForkStatus.DIFFERENT_CHAIN) {
				this.logger.debug(
					{ id: block.id, height: block.height },
					'Detected different chain to sync',
				);
				const blockJSON = await this.serialize(block);
				this.channel.publish('app:chain:sync', {
					block: blockJSON,
					peerId,
				});
				this.channel.publish('app:chain:fork', { block: blockJSON });
				return;
			}
			// Replacing a block
			if (forkStatus === ForkStatus.TIE_BREAK) {
				this.logger.info(
					{ id: lastBlock.id, height: lastBlock.height },
					'Received tie breaking block',
				);
				const blockJSON = await this.serialize(block);
				this.channel.publish('app:chain:fork', { block: blockJSON });

				await blockProcessor.validate.run({
					block,
					lastBlock,
					stateStore,
				});
				const previousLastBlock = cloneDeep(lastBlock);
				await this._deleteBlock(lastBlock, blockProcessor);
				const newLastBlock = this.chainModule.lastBlock;
				try {
					await this._processValidated(block, newLastBlock, blockProcessor);
				} catch (err) {
					this.logger.error(
						{ id: block.id, previousBlockId: previousLastBlock.id, err },
						'Failed to apply newly received block. restoring previous block.',
					);
					await this._processValidated(
						previousLastBlock,
						newLastBlock,
						blockProcessor,
						{ skipBroadcast: true },
					);
				}
				return;
			}

			this.logger.debug(
				{ id: block.id, height: block.height },
				'Processing valid block',
			);
			await blockProcessor.validate.run({
				block,
				lastBlock,
				stateStore,
			});
			await this._processValidated(block, lastBlock, blockProcessor);
		});
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async forkStatus(
		receivedBlock: BlockInstance,
		lastBlock?: BlockInstance,
	): Promise<number> {
		const blockProcessor = this._getBlockProcessor(receivedBlock);

		return blockProcessor.forkStatus.run({
			block: receivedBlock,
			lastBlock: lastBlock ?? this.chainModule.lastBlock,
		});
	}

	public async create(data: CreateInput): Promise<BlockInstance> {
		const { previousBlock } = data;
		this.logger.trace(
			{
				previousBlockId: previousBlock.id,
				previousBlockHeight: previousBlock.height,
			},
			'Creating block',
		);
		const highestVersion = Math.max.apply(
			null,
			Object.keys(this.processors).map(v => parseInt(v, 10)),
		);
		const processor = this.processors[highestVersion];
		const stateStore = await this.chainModule.newStateStore();

		return processor.create.run({ data, stateStore });
	}

	public async validate(block: BlockInstance): Promise<void> {
		this.logger.debug(
			{ id: block.id, height: block.height },
			'Validating block',
		);
		const blockProcessor = this._getBlockProcessor(block);
		await blockProcessor.validate.run({
			block,
		});
	}

	// processValidated processes a block assuming that statically it's valid
	public async processValidated(
		block: BlockInstance,
		{ removeFromTempTable = false }: { removeFromTempTable?: boolean } = {},
	): Promise<BlockInstance> {
		return this.sequence.add<BlockInstance>(async () => {
			this.logger.debug(
				{ id: block.id, height: block.height },
				'Processing validated block',
			);
			const { lastBlock } = this.chainModule;
			const blockProcessor = this._getBlockProcessor(block);
			return this._processValidated(block, lastBlock, blockProcessor, {
				skipBroadcast: true,
				removeFromTempTable,
			});
		});
	}

	// apply processes a block assuming that statically it's valid without saving a block
	public async apply(block: BlockInstance): Promise<BlockInstance> {
		return this.sequence.add<BlockInstance>(async () => {
			this.logger.debug(
				{ id: block.id, height: block.height },
				'Applying block',
			);
			const { lastBlock } = this.chainModule;
			const blockProcessor = this._getBlockProcessor(block);
			return this._processValidated(block, lastBlock, blockProcessor, {
				saveOnlyState: true,
				skipBroadcast: true,
			});
		});
	}

	public async deleteLastBlock({
		saveTempBlock = false,
	}: { saveTempBlock?: boolean } = {}): Promise<BlockInstance> {
		return this.sequence.add<BlockInstance>(async () => {
			const { lastBlock } = this.chainModule;
			this.logger.debug(
				{ id: lastBlock.id, height: lastBlock.height },
				'Deleting last block',
			);
			const blockProcessor = this._getBlockProcessor(lastBlock);
			await this._deleteBlock(lastBlock, blockProcessor, saveTempBlock);
			return this.chainModule.lastBlock;
		});
	}

	public async applyGenesisBlock(block: BlockInstance): Promise<BlockInstance> {
		this.logger.info({ id: block.id }, 'Applying genesis block');
		const blockProcessor = this._getBlockProcessor(block);
		return this._processGenesis(block, blockProcessor, { saveOnlyState: true });
	}

	private async _processValidated(
		block: BlockInstance,
		lastBlock: BlockInstance,
		processor: BaseBlockProcessor,
		{
			saveOnlyState,
			skipBroadcast,
			removeFromTempTable = false,
		}: {
			saveOnlyState?: boolean;
			skipBroadcast?: boolean;
			removeFromTempTable?: boolean;
		} = {},
	): Promise<BlockInstance> {
		const stateStore = await this.chainModule.newStateStore();
		await processor.verify.run({
			block,
			lastBlock,
			skipExistingCheck: saveOnlyState,
			stateStore,
		});

		const blockJSON = await this.serialize(block);
		if (!skipBroadcast) {
			this.channel.publish('app:block:broadcast', {
				block: blockJSON,
			});
		}

		// Apply should always be executed after save as it performs database calculations
		// i.e. Dpos.apply expects to have this processing block in the database
		await processor.apply.run({
			block,
			lastBlock,
			skipExistingCheck: saveOnlyState,
			stateStore,
		});

		await this.chainModule.save(block, stateStore, {
			saveOnlyState: !!saveOnlyState,
			removeFromTempTable,
		});

		return block;
	}

	private async _processGenesis(
		block: BlockInstance,
		processor: BaseBlockProcessor,
		{ saveOnlyState } = { saveOnlyState: false },
	) {
		const stateStore = await this.chainModule.newStateStore();
		const isPersisted = await this.chainModule.exists(block);
		if (saveOnlyState && !isPersisted) {
			throw new Error('Genesis block is not persisted but skipping to save');
		}
		// If block is persisted and we don't want to save, it means that we are rebuilding. Therefore, don't return without applying block.
		if (isPersisted && !saveOnlyState) {
			return block;
		}
		await processor.applyGenesis.run({
			block,
			stateStore,
		});
		await this.chainModule.save(block, stateStore, {
			saveOnlyState,
			removeFromTempTable: false,
		});

		return block;
	}

	private async _deleteBlock(
		block: BlockInstance,
		processor: BaseBlockProcessor,
		saveTempBlock = false,
	) {
		// Offset must be set to 1, because lastBlock is still this deleting block
		const stateStore = await this.chainModule.newStateStore(1);
		await processor.undo.run({
			block,
			stateStore,
		});
		await this.chainModule.remove(block, stateStore, { saveTempBlock });
	}

	private _getBlockProcessor(
		block: BlockInstance | BlockJSON,
	): BaseBlockProcessor {
		const { version } = block;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!this.processors[version]) {
			throw new Error('Block processing version is not registered');
		}
		// Sort in asc order
		const matcherVersions = Object.keys(this.matchers).sort((a, b) =>
			a.localeCompare(b, 'en'),
		);
		// eslint-disable-next-line no-restricted-syntax
		for (const matcherVersion of matcherVersions) {
			const matcher = this.matchers[matcherVersion];
			if (matcher(block)) {
				return this.processors[matcherVersion];
			}
		}
		throw new Error('No matching block processor found');
	}
}
