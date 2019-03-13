const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const git = require('./helpers/git.js');
const Sequence = require('./helpers/sequence.js');
const ed = require('./helpers/ed.js');
// eslint-disable-next-line import/order
const ZSchema = require('./helpers/z_schema');
const { createStorageComponent } = require('../../components/storage');
const { createCacheComponent } = require('../../components/cache');
const { createLoggerComponent } = require('../../components/logger');
const { createSystemComponent } = require('../../components/system');
const {
	lookupPeerIPs,
	createBus,
	bootstrapStorage,
	bootstrapCache,
	createSocketCluster,
	initLogicStructure,
	initModules,
} = require('./init_steps');
const defaults = require('./defaults');

// Begin reading from stdin
process.stdin.resume();

// Read build version from file
const versionBuild = fs
	.readFileSync(path.join(__dirname, '../../../../', '.build'), 'utf8')
	.toString()
	.trim();

/**
 * Hash of the last git commit.
 *
 * @memberof! app
 */
let lastCommit = '';

if (typeof gc !== 'undefined') {
	setInterval(() => {
		gc(); // eslint-disable-line no-undef
	}, 60000);
}

/**
 * Chain Module
 *
 * @namespace Framework.modules.chain
 * @type {module.Chain}
 */
module.exports = class Chain {
	constructor(channel, options) {
		this.channel = channel;
		this.options = options;
		this.logger = null;
		this.scope = null;
		this.blockReward = null;
	}

	async bootstrap() {
		const loggerConfig = await this.channel.invoke(
			'lisk:getComponentConfig',
			'logger'
		);
		const storageConfig = await this.channel.invoke(
			'lisk:getComponentConfig',
			'storage'
		);

		const cacheConfig = await this.channel.invoke(
			'lisk:getComponentConfig',
			'cache'
		);

		const systemConfig = await this.channel.invoke(
			'lisk:getComponentConfig',
			'system'
		);

		this.logger = createLoggerComponent(loggerConfig);
		const dbLogger =
			storageConfig.logFileName &&
			storageConfig.logFileName === loggerConfig.logFileName
				? this.logger
				: createLoggerComponent(
						Object.assign({}, loggerConfig, {
							logFileName: storageConfig.logFileName,
						})
					);

		// Try to get the last git commit
		try {
			lastCommit = git.getLastCommit();
		} catch (err) {
			this.logger.debug('Cannot get last git commit', err.message);
		}

		global.constants = this.options.constants;
		global.exceptions = Object.assign(
			{},
			defaults.exceptions,
			this.options.exceptions
		);

		const BlockReward = require('./logic/block_reward');
		this.blockReward = new BlockReward();

		try {
			// Cache
			this.logger.debug('Initiating cache...');
			const cache = createCacheComponent(cacheConfig, this.logger);

			// Storage
			this.logger.debug('Initiating storage...');
			const storage = createStorageComponent(storageConfig, dbLogger);

			// System
			this.logger.debug('Initiating system...');
			const system = createSystemComponent(systemConfig, this.logger, storage);

			if (!this.options.config) {
				throw Error('Failed to assign nethash from genesis block');
			}

			const self = this;
			const scope = {
				lastCommit,
				ed,
				build: versionBuild,
				config: self.options.config,
				genesisBlock: { block: self.options.config.genesisBlock },
				schema: new ZSchema(),
				sequence: new Sequence({
					onWarning(current) {
						self.logger.warn('Main queue', current);
					},
				}),
				balancesSequence: new Sequence({
					onWarning(current) {
						self.logger.warn('Balance queue', current);
					},
				}),
				components: {
					storage,
					cache,
					logger: self.logger,
					system,
				},
				channel: this.channel,
			};

			// Lookup for peers ips from dns
			scope.config.peers.list = await lookupPeerIPs(
				scope.config.peers.list,
				scope.config.peers.enabled
			);

			await bootstrapStorage(scope, global.constants.ACTIVE_DELEGATES);
			await bootstrapCache(scope);

			scope.bus = await createBus();
			scope.logic = await initLogicStructure(scope);
			scope.modules = await initModules(scope);
			scope.webSocket = await createSocketCluster(scope);
			// Ready to bind modules
			scope.logic.peers.bindModules(scope.modules);

			// Fire onBind event in every module
			scope.bus.message('bind', scope);

			// Listen to websockets
			await scope.webSocket.listen();
			self.logger.info('Modules ready and launched');

			self.scope = scope;
		} catch (error) {
			this.logger.fatal('Chain initialization', {
				message: error.message,
				stack: error.stack,
			});
			process.emit('cleanup', error);
		}
	}

	get actions() {
		return {
			calculateSupply: action =>
				this.blockReward.calcSupply(action.params.height),
			calculateMilestone: action =>
				this.blockReward.calcMilestone(action.params.height),
			calculateReward: action =>
				this.blockReward.calcReward(action.params.height),
			generateDelegateList: action =>
				promisify(this.scope.modules.delegates.generateDelegateList)(
					action.params.round,
					action.params.source
				),
			getNetworkHeight: async action =>
				promisify(this.scope.modules.peers.networkHeight)(
					action.params.options
				),
			getAllTransactionsCount: async () =>
				promisify(
					this.scope.modules.transactions.shared.getTransactionsCount
				)(),
			updateForgingStatus: async action =>
				promisify(this.scope.modules.delegates.updateForgingStatus)(
					action.params.publicKey,
					action.params.password,
					action.params.forging
				),
			getPeers: async action =>
				promisify(this.scope.modules.peers.shared.getPeers)(
					action.params.parameters
				),
			getPeersCountByFilter: async action =>
				this.scope.modules.peers.shared.getPeersCountByFilter(
					action.params.parameters
				),
			postSignature: async action =>
				promisify(this.scope.modules.signatures.shared.postSignature)(
					action.params.signature
				),
			getLastConsensus: async () => this.scope.modules.peers.getLastConsensus(),
			loaderLoaded: async () => this.scope.modules.loader.loaded(),
			loaderSyncing: async () => this.scope.modules.loader.syncing(),
			getForgersKeyPairs: async () =>
				this.scope.modules.delegates.getForgersKeyPairs(),
			getTransactionsFromPool: async action =>
				promisify(
					this.scope.modules.transactions.shared.getTransactionsFromPool
				)(action.params.type, action.params.filters),
			getLastCommit: async () => this.scope.lastCommit,
			getBuild: async () => this.scope.build,
			postTransaction: async action =>
				promisify(this.scope.modules.transactions.shared.postTransaction)(
					action.params.transaction
				),
			getDelegateBlocksRewards: async action =>
				this.scope.components.storage.entities.Account.delegateBlocksRewards(
					action.params.filters,
					action.params.transaction
				),
		};
	}

	async cleanup(code, error) {
		const { webSocket, modules, components } = this.scope;
		if (error) {
			this.logger.fatal(error.toString());
			if (code === undefined) {
				code = 1;
			}
		} else if (code === undefined || code === null) {
			code = 0;
		}
		this.logger.info('Cleaning chain...');

		if (webSocket) {
			webSocket.removeAllListeners('fail');
			webSocket.destroy();
		}

		if (components !== undefined) {
			components.map(component => component.cleanup());
		}

		// Run cleanup operation on each module before shutting down the node;
		// this includes operations like snapshotting database tables.
		await Promise.all(
			modules.map(module => {
				if (typeof module.cleanup === 'function') {
					return promisify(module.cleanup)();
				}
				return true;
			})
		).catch(moduleCleanupError => {
			this.logger.error(moduleCleanupError);
		});

		this.logger.info('Cleaned up successfully');
	}
};
