/*
 * Copyright © 2022 Lisk Foundation
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

import { removeSync } from 'fs-extra';
import { when } from 'jest-when';
import {
	ApplicationConfigForPlugin,
	GenesisConfig,
	testing,
	cryptography,
	apiClient,
	db,
} from 'lisk-sdk';
import { ChainConnectorPlugin } from '../../src/chain_connector_plugin';
import * as chainConnectorDB from '../../src/db';
import { CCMsFromEvents, CCMsFromEventsJSON, LastSentCCMWithHeightJSON } from '../../src/types';
import { ccmsFromEventsToJSON, getMainchainID } from '../../src/utils';

describe('endpoints', () => {
	const ownChainID = Buffer.from('10000000', 'hex');
	const appConfigForPlugin: ApplicationConfigForPlugin = {
		...testing.fixtures.defaultConfig,
		genesis: {
			chainID: ownChainID.toString('hex'),
		} as GenesisConfig,
		generator: {
			keys: {
				fromFile: '',
			},
		},
		modules: {},
		legacy: {
			brackets: [],
			sync: false,
		},
	};

	const validators = [
		{
			address: cryptography.utils.getRandomBytes(20),
			bftWeight: BigInt(2),
			blsKey: cryptography.utils.getRandomBytes(20),
		},
	];
	const validatorsJSON = [
		{
			address: validators[0].address.toString('hex'),
			bftWeight: BigInt(2).toString(),
			blsKey: validators[0].blsKey.toString('hex'),
		},
	];
	const validatorsData = {
		certificateThreshold: BigInt(70),
		validators,
		validatorsHash: cryptography.utils.getRandomBytes(20),
	};
	const validatorsDataJSON = {
		certificateThreshold: validatorsData.certificateThreshold.toString(),
		validators: validatorsJSON,
		validatorsHash: validatorsData.validatorsHash.toString('hex'),
	};
	const aggregateCommit = {
		height: 0,
		aggregationBits: Buffer.alloc(0),
		certificateSignature: Buffer.alloc(0),
	};
	const aggregateCommitJSON = {
		height: 0,
		aggregationBits: Buffer.alloc(0).toString('hex'),
		certificateSignature: Buffer.alloc(0).toString('hex'),
	};
	const lastSentCCM = {
		crossChainCommand: 'transfer',
		fee: BigInt(0),
		module: 'token',
		nonce: BigInt(0),
		params: Buffer.alloc(2),
		receivingChainID: Buffer.from('04000001', 'hex'),
		sendingChainID: Buffer.from('04000000', 'hex'),
		status: 1,
	};
	const defaultPrivateKey =
		'6c5e2b24ff1cc99da7a49bd28420b93b2a91e2e2a3b0a0ce07676966b707d3c2859bbd02747cf8e26dab592c02155dfddd4a16b0fe83fd7e7ffaec0b5391f3f7';
	const defaultPassword = '123';
	const defaultCCUFee = '100000000';

	let chainConnectorPlugin: ChainConnectorPlugin;

	beforeEach(async () => {
		chainConnectorPlugin = new ChainConnectorPlugin();
		const sendingChainAPIClientMock = {
			subscribe: jest.fn(),
			invoke: jest.fn(),
		};

		const receivingChainAPIClientMock = {
			subscribe: jest.fn(),
			invoke: jest.fn(),
		};

		jest
			.spyOn(apiClient, 'createIPCClient')
			.mockResolvedValue(receivingChainAPIClientMock as never);
		when(sendingChainAPIClientMock.invoke)
			.calledWith('interoperability_getOwnChainAccount')
			.mockResolvedValue({
				chainID: ownChainID.toString('hex'),
			});
		when(receivingChainAPIClientMock.invoke)
			.calledWith('interoperability_getOwnChainAccount')
			.mockResolvedValue({
				chainID: getMainchainID(ownChainID).toString('hex'),
			});
		when(receivingChainAPIClientMock.invoke)
			.calledWith('interoperability_getChainAccount', { chainID: ownChainID.toString('hex') })
			.mockResolvedValue({
				lastCertificate: {
					height: 10,
					stateRoot: cryptography.utils.getRandomBytes(32).toString('hex'),
					timestamp: Date.now(),
					validatorsHash: cryptography.utils.getRandomBytes(32).toString('hex'),
				},
				name: 'chain1',
				status: 1,
			});
		jest
			.spyOn(chainConnectorDB, 'getDBInstance')
			.mockResolvedValue(new db.InMemoryDatabase() as never);

		const encryptedKey = await cryptography.encrypt.encryptMessageWithPassword(
			Buffer.from(defaultPrivateKey, 'hex'),
			defaultPassword,
			{
				kdfparams: {
					iterations: 1,
					memorySize: 256,
					parallelism: 1,
				},
			},
		);
		const defaultEncryptedPrivateKey = cryptography.encrypt.stringifyEncryptedMessage(encryptedKey);

		await chainConnectorPlugin.init({
			config: {
				receivingChainIPCPath: '~/.lisk/mainchain',
				sendingChainIPCPath: '~/.lisk/sidechain',
				ccuFee: defaultCCUFee,
				encryptedPrivateKey: defaultEncryptedPrivateKey,
				ccuFrequency: 10,
				password: defaultPassword,
				receivingChainID: getMainchainID(ownChainID).toString('hex'),
			},
			appConfig: appConfigForPlugin,
			logger: testing.mocks.loggerMock,
		});
		(chainConnectorPlugin as any)['_apiClient'] = sendingChainAPIClientMock;

		await chainConnectorPlugin.load();
		await chainConnectorPlugin['_chainConnectorStore'].setAggregateCommits([aggregateCommit]);
		await chainConnectorPlugin['_chainConnectorStore'].setValidatorsHashPreimage([validatorsData]);
	});

	afterEach(async () => {
		(chainConnectorPlugin as any)['_sidechainAPIClient'] = {
			disconnect: jest.fn(),
		};
		(chainConnectorPlugin as any)['_mainchainAPIClient'] = {
			disconnect: jest.fn(),
		};

		await chainConnectorPlugin['_chainConnectorStore']['_db'].clear();
	});

	afterAll(() => {
		chainConnectorPlugin['_chainConnectorStore']['_db'].close();

		removeSync(chainConnectorPlugin['dataPath']);
	});

	describe('getSentCCUs', () => {
		it('should return sent ccus', async () => {
			const response = await chainConnectorPlugin.endpoint.getSentCCUs({} as any);

			expect(response).toStrictEqual([]);
		});
	});

	describe('getAggregateCommits', () => {
		it('should return aggregate commits', async () => {
			const response = await chainConnectorPlugin.endpoint.getAggregateCommits({} as any);

			expect(response).toStrictEqual([aggregateCommitJSON]);
		});
	});

	describe('getValidatorsInfoFromPreimage', () => {
		it('should return list of validators info', async () => {
			const response = await chainConnectorPlugin.endpoint.getValidatorsInfoFromPreimage({} as any);

			expect(response).toStrictEqual([validatorsDataJSON]);
		});
	});

	describe('getBlockHeaders', () => {
		let blockHeadersObj: any;
		let blockHeadersJSON: any;

		beforeEach(async () => {
			const blockHeaders = new Array(5).fill(0).map(_ => testing.createFakeBlockHeader());
			blockHeadersObj = blockHeaders.map(b => b.toObject());
			blockHeadersJSON = blockHeaders.map(b => b.toJSON());
			await chainConnectorPlugin['_chainConnectorStore'].setBlockHeaders(blockHeadersObj);
		});

		it('should return list of block headers', async () => {
			const response = await chainConnectorPlugin.endpoint.getBlockHeaders({} as any);

			expect(response).toStrictEqual(blockHeadersJSON);
		});
	});

	describe('getCrossChainMessages', () => {
		let ccmsFromEvents: CCMsFromEvents;
		let ccmsFromEventsJSON: CCMsFromEventsJSON;

		beforeEach(async () => {
			ccmsFromEvents = {
				ccms: [
					{
						...lastSentCCM,
					},
				],
				height: 1,
				inclusionProof: {
					bitmap: Buffer.alloc(0),
					siblingHashes: [],
				},
				outboxSize: 2,
			};
			ccmsFromEventsJSON = ccmsFromEventsToJSON(ccmsFromEvents);
			await chainConnectorPlugin['_chainConnectorStore'].setCrossChainMessages([ccmsFromEvents]);
		});

		it('should return list of ccms from events', async () => {
			const response = await chainConnectorPlugin.endpoint.getCrossChainMessages({} as any);

			expect(response).toStrictEqual([ccmsFromEventsJSON]);
		});
	});

	describe('getLastSentCCM', () => {
		let lastSentCCMJSON: LastSentCCMWithHeightJSON;

		beforeEach(async () => {
			lastSentCCMJSON = {
				...lastSentCCM,
				height: 1,
				fee: lastSentCCM.fee.toString(),
				nonce: lastSentCCM.nonce.toString(),
				params: lastSentCCM.params.toString('hex'),
				receivingChainID: lastSentCCM.receivingChainID.toString('hex'),
				sendingChainID: lastSentCCM.sendingChainID.toString('hex'),
			};
			await chainConnectorPlugin['_chainConnectorStore'].setLastSentCCM({
				...lastSentCCM,
				height: lastSentCCMJSON.height,
			});
		});

		it('should return list of ccms from events', async () => {
			const response = await chainConnectorPlugin.endpoint.getLastSentCCM({} as any);

			expect(response).toStrictEqual(lastSentCCMJSON);
		});
	});

	describe('authorize', () => {
		it('should reject when invalid params is given', async () => {
			await expect(chainConnectorPlugin.endpoint.authorize({ params: {} } as any)).rejects.toThrow(
				"must have required property 'password'",
			);
		});

		it('should enable when correct password is given', async () => {
			await expect(
				chainConnectorPlugin.endpoint.authorize({
					params: { enable: true, password: defaultPassword },
				} as any),
			).resolves.toEqual({
				result: 'Successfully enabled the chain connector plugin.',
			});
		});

		it('should not enable when incorrect password is given', async () => {
			await expect(
				chainConnectorPlugin.endpoint.authorize({
					params: { enable: true, password: 'invalid' },
				} as any),
			).rejects.toThrow('Unsupported state or unable to authenticate data');
		});

		it('should not disable when incorrect password is given', async () => {
			await expect(
				chainConnectorPlugin.endpoint.authorize({
					params: { enable: false, password: defaultPassword },
				} as any),
			).resolves.toEqual({
				result: 'Successfully disabled the chain connector plugin.',
			});
		});

		it('should disable when incorrect password is given', async () => {
			await expect(
				chainConnectorPlugin.endpoint.authorize({
					params: { enable: false, password: 'invalid' },
				} as any),
			).rejects.toThrow('Unsupported state or unable to authenticate data');
		});
	});
});
