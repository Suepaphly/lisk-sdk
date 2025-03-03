/*
 * Copyright © 2021 Lisk Foundation
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

import { when } from 'jest-when';
import { RewardModule } from '../../../../src/modules/reward';
import { createBlockContext, createBlockHeaderWithDefaults } from '../../../../src/testing';
import {
	REWARD_NO_REDUCTION,
	REWARD_REDUCTION_SEED_REVEAL,
	REWARD_REDUCTION_MAX_PREVOTES,
	CONTEXT_STORE_KEY_BLOCK_REWARD,
	CONTEXT_STORE_KEY_BLOCK_REDUCTION,
	REWARD_REDUCTION_NO_ACCOUNT,
} from '../../../../src/modules/reward/constants';
import { RewardMintedEvent } from '../../../../src/modules/reward/events/reward_minted';

describe('RewardModule', () => {
	const genesisConfig: any = {};
	const moduleConfig = {
		distance: 3000000,
		offset: 2160,
		brackets: [
			'500000000', // Initial Reward
			'400000000', // Milestone 1
			'300000000', // Milestone 2
			'200000000', // Milestone 3
			'100000000', // Milestone 4
		],
		tokenID: '0000000000000000',
		rewardReductionFactorBFT: '4',
	};

	let rewardModule: RewardModule;
	let tokenMethod: any;
	let mint: any;
	beforeEach(async () => {
		mint = jest.fn();
		rewardModule = new RewardModule();
		await rewardModule.init({ genesisConfig, moduleConfig });
		tokenMethod = {
			mint,
			userSubstoreExists: jest.fn(),
		} as any;
		rewardModule.addDependencies(tokenMethod, {
			isSeedRevealValid: jest.fn().mockReturnValue(true),
		} as any);
	});

	describe('init', () => {
		it('should initialize config with default value when module config is empty', async () => {
			rewardModule = new RewardModule();
			await expect(
				rewardModule.init({ genesisConfig: { chainID: '00000000' } as any, moduleConfig: {} }),
			).toResolve();

			expect(rewardModule['_moduleConfig']).toEqual({
				...moduleConfig,
				brackets: moduleConfig.brackets.map(b => BigInt(b)),
				tokenID: Buffer.from(moduleConfig.tokenID, 'hex'),
				rewardReductionFactorBFT: BigInt(moduleConfig.rewardReductionFactorBFT),
			});
		});

		it('should initialize config with given value', async () => {
			rewardModule = new RewardModule();
			await expect(
				rewardModule.init({
					genesisConfig: { chainID: '00000000' } as any,
					moduleConfig: { offset: 1000 },
				}),
			).toResolve();

			expect(rewardModule['_moduleConfig'].offset).toBe(1000);
		});

		it('should not initialize config with invalid value for tokenID', async () => {
			rewardModule = new RewardModule();
			try {
				await rewardModule.init({
					genesisConfig: {} as any,
					moduleConfig: {
						tokenID: '00000000000000000',
					},
				});
			} catch (error: any) {
				expect(error.message).toInclude("Property '.tokenID' must NOT have more than 16 character");
			}
		});
	});

	describe('beforeTransactionsExecute', () => {
		const blockHeader = createBlockHeaderWithDefaults({ height: moduleConfig.offset });
		const blockExecuteContext = createBlockContext({
			header: blockHeader,
		}).getBlockExecuteContext();
		it('should store appropriate reward and reduction values', async () => {
			rewardModule.method.getBlockReward = jest
				.fn()
				.mockReturnValue([BigInt(1), REWARD_NO_REDUCTION]);
			await rewardModule.beforeTransactionsExecute(blockExecuteContext);
			expect(blockExecuteContext.contextStore.get(CONTEXT_STORE_KEY_BLOCK_REWARD)).toEqual(
				BigInt(1),
			);
			expect(blockExecuteContext.contextStore.get(CONTEXT_STORE_KEY_BLOCK_REDUCTION)).toEqual(
				REWARD_NO_REDUCTION,
			);
		});
	});

	describe('afterTransactionsExecute', () => {
		const blockHeader = createBlockHeaderWithDefaults({ height: moduleConfig.offset });
		let blockExecuteContext: any;
		let blockAfterExecuteContext: any;

		beforeEach(() => {
			const contextStore = new Map<string, unknown>();
			blockAfterExecuteContext = createBlockContext({
				contextStore,
				header: blockHeader,
			}).getBlockAfterExecuteContext();
			blockExecuteContext = createBlockContext({
				contextStore,
				header: blockHeader,
			}).getBlockExecuteContext();
			jest.spyOn(rewardModule.events.get(RewardMintedEvent), 'log');
			jest.spyOn(tokenMethod, 'userSubstoreExists');
			when(tokenMethod.userSubstoreExists)
				.calledWith(
					expect.anything(),
					blockAfterExecuteContext.header.generatorAddress,
					rewardModule['_moduleConfig'].tokenID,
				)
				.mockResolvedValue(true as never);
		});

		it(`should call mint for a valid bracket`, async () => {
			await rewardModule.beforeTransactionsExecute(blockExecuteContext);
			await rewardModule.afterTransactionsExecute(blockAfterExecuteContext);
			expect(mint).toHaveBeenCalledTimes(1);
		});

		it('should emit rewardMinted event for event type REWARD_NO_REDUCTION if block reward is greater than 0 and user account exists for the generator address', async () => {
			rewardModule.method.getBlockReward = jest
				.fn()
				.mockReturnValue([BigInt(1), REWARD_NO_REDUCTION]);
			await rewardModule.beforeTransactionsExecute(blockExecuteContext);
			await rewardModule.afterTransactionsExecute(blockAfterExecuteContext);
			expect(mint).toHaveBeenCalledTimes(1);
			expect(rewardModule.events.get(RewardMintedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				blockHeader.generatorAddress,
				{
					amount: BigInt(1),
					reduction: 0,
				},
			);
		});

		it('should not call mint and emit rewardMinted event for event type REWARD_REDUCTION_NO_ACCOUNT if block reward is greater than 0 but no user account exists for the generator address', async () => {
			when(tokenMethod.userSubstoreExists)
				.calledWith(
					expect.anything(),
					blockAfterExecuteContext.header.generatorAddress,
					rewardModule['_moduleConfig'].tokenID,
				)
				.mockResolvedValue(false as never);
			rewardModule.method.getBlockReward = jest
				.fn()
				.mockReturnValue([BigInt(1), REWARD_NO_REDUCTION]);
			await rewardModule.beforeTransactionsExecute(blockExecuteContext);
			await rewardModule.afterTransactionsExecute(blockAfterExecuteContext);
			expect(mint).toHaveBeenCalledTimes(0);
			expect(rewardModule.events.get(RewardMintedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				blockHeader.generatorAddress,
				{
					amount: BigInt(0),
					reduction: REWARD_REDUCTION_NO_ACCOUNT,
				},
			);
		});

		it('should emit rewardMinted event for event type REWARD_REDUCTION_SEED_REVEAL', async () => {
			rewardModule.method.getBlockReward = jest
				.fn()
				.mockReturnValue([BigInt(0), REWARD_REDUCTION_SEED_REVEAL]);
			await rewardModule.beforeTransactionsExecute(blockExecuteContext);
			await rewardModule.afterTransactionsExecute(blockAfterExecuteContext);
			expect(mint).toHaveBeenCalledTimes(0);
			expect(rewardModule.events.get(RewardMintedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				blockHeader.generatorAddress,
				{
					amount: BigInt(0),
					reduction: 1,
				},
			);
		});

		it('should emit rewardMinted event for event type REWARD_REDUCTION_MAX_PREVOTES', async () => {
			rewardModule.method.getBlockReward = jest
				.fn()
				.mockReturnValue([
					BigInt(1) / BigInt(rewardModule['_moduleConfig'].rewardReductionFactorBFT),
					REWARD_REDUCTION_MAX_PREVOTES,
				]);
			await rewardModule.beforeTransactionsExecute(blockExecuteContext);
			await rewardModule.afterTransactionsExecute(blockAfterExecuteContext);
			expect(mint).toHaveBeenCalledTimes(0);
			expect(rewardModule.events.get(RewardMintedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				blockHeader.generatorAddress,
				{
					amount: BigInt(0),
					reduction: 2,
				},
			);
		});
	});
});
