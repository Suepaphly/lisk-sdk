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

import { codec } from '@liskhq/lisk-codec';
import { Transaction } from '@liskhq/lisk-chain';
import { utils } from '@liskhq/lisk-cryptography';
import { validator } from '@liskhq/lisk-validator';
import { CommandExecuteContext, MainchainInteroperabilityModule } from '../../../../../../src';
import { BaseCCCommand } from '../../../../../../src/modules/interoperability/base_cc_command';
import { BaseCCMethod } from '../../../../../../src/modules/interoperability/base_cc_method';
import {
	COMMAND_NAME_LIVENESS_TERMINATION,
	MODULE_NAME_INTEROPERABILITY,
} from '../../../../../../src/modules/interoperability/constants';
import { terminateSidechainForLivenessParamsSchema } from '../../../../../../src/modules/interoperability/schemas';
import {
	ChainAccount,
	TerminateSidechainForLivenessParams,
} from '../../../../../../src/modules/interoperability/types';
import { CommandVerifyContext, VerifyStatus } from '../../../../../../src/state_machine/types';
import { createTransactionContext } from '../../../../../../src/testing';
import { TransactionContext } from '../../../../../../src/state_machine';
import {
	ChainAccountStore,
	ChainStatus,
} from '../../../../../../src/modules/interoperability/stores/chain_account';
import { TerminateSidechainForLivenessCommand } from '../../../../../../src/modules/interoperability';
import { CHAIN_ID_LENGTH } from '../../../../../../src/modules/token/constants';

describe('TerminateSidechainForLivenessCommand', () => {
	const interopMod = new MainchainInteroperabilityModule();
	let livenessTerminationCommand: TerminateSidechainForLivenessCommand;
	let commandVerifyContext: CommandVerifyContext<TerminateSidechainForLivenessParams>;
	let interoperableCCMethods: Map<string, BaseCCMethod>;
	let ccCommands: Map<string, BaseCCCommand[]>;
	let transaction: Transaction;
	let transactionParams: TerminateSidechainForLivenessParams;
	let encodedTransactionParams: Buffer;

	beforeEach(() => {
		interoperableCCMethods = new Map();
		ccCommands = new Map();
		transactionParams = {
			chainID: utils.intToBuffer(3, 4),
		};
		encodedTransactionParams = codec.encode(
			terminateSidechainForLivenessParamsSchema,
			transactionParams,
		);
		transaction = new Transaction({
			module: MODULE_NAME_INTEROPERABILITY,
			command: COMMAND_NAME_LIVENESS_TERMINATION,
			fee: BigInt(100000000),
			nonce: BigInt(0),
			params: encodedTransactionParams,
			senderPublicKey: utils.getRandomBytes(32),
			signatures: [],
		});
		livenessTerminationCommand = new TerminateSidechainForLivenessCommand(
			interopMod.stores,
			interopMod.events,
			interoperableCCMethods,
			ccCommands,
			interopMod['internalMethod'],
		);
	});

	describe('verifySchema', () => {
		it(`should throw error when chainID is not bytes`, () => {
			expect(() =>
				validator.validate(livenessTerminationCommand.schema, {
					chainID: 123,
				}),
			).toThrow('Property \'.chainID\' should pass "dataType" keyword validation');
		});
		it(`should throw error when chainID has length less than ${CHAIN_ID_LENGTH}`, () => {
			expect(() =>
				validator.validate(livenessTerminationCommand.schema, {
					chainID: Buffer.alloc(CHAIN_ID_LENGTH - 1),
				}),
			).toThrow("Property '.chainID' minLength not satisfied");
		});
		it(`should throw error when chainID has length greater than ${CHAIN_ID_LENGTH}`, () => {
			expect(() =>
				validator.validate(livenessTerminationCommand.schema, {
					chainID: Buffer.alloc(CHAIN_ID_LENGTH + 1),
				}),
			).toThrow("Property '.chainID' maxLength exceeded");
		});
	});

	describe('verify', () => {
		let chainAccount: ChainAccount;

		beforeEach(async () => {
			chainAccount = {
				lastCertificate: {
					height: 10,
					stateRoot: utils.getRandomBytes(32),
					timestamp: Math.floor(Date.now() / 1000),
					validatorsHash: utils.getRandomBytes(32),
				},
				name: 'staleSidechain',
				status: ChainStatus.ACTIVE,
			};
			commandVerifyContext = createTransactionContext({
				transaction,
			}).createCommandVerifyContext<TerminateSidechainForLivenessParams>(
				terminateSidechainForLivenessParamsSchema,
			);

			await interopMod.stores
				.get(ChainAccountStore)
				.set(commandVerifyContext as any, transactionParams.chainID, chainAccount);
			jest.spyOn(interopMod['internalMethod'], 'isLive').mockResolvedValue(true);
		});

		it('should return error when chain account does not exist', async () => {
			await interopMod.stores
				.get(ChainAccountStore)
				.del(commandVerifyContext as any, transactionParams.chainID);

			await expect(livenessTerminationCommand.verify(commandVerifyContext)).rejects.toThrow(
				'Chain account does not exist',
			);
		});

		it('should return error when chain is already terminated', async () => {
			await interopMod.stores
				.get(ChainAccountStore)
				.set(commandVerifyContext as any, transactionParams.chainID, {
					...chainAccount,
					status: ChainStatus.TERMINATED,
				});

			await expect(livenessTerminationCommand.verify(commandVerifyContext)).rejects.toThrow(
				'Sidechain is already terminated',
			);
		});

		it('should return error if the chain is live', async () => {
			await expect(livenessTerminationCommand.verify(commandVerifyContext)).rejects.toThrow(
				'Sidechain did not violate the liveness condition',
			);
		});

		it('should return VerifyStatus.OK when chain is not active', async () => {
			jest.spyOn(interopMod['internalMethod'], 'isLive').mockResolvedValue(false);

			const result = await livenessTerminationCommand.verify(commandVerifyContext);

			expect(result.status).toBe(VerifyStatus.OK);
		});
	});

	describe('execute', () => {
		let commandExecuteContext: CommandExecuteContext<TerminateSidechainForLivenessParams>;
		let transactionContext: TransactionContext;

		beforeEach(() => {
			transactionContext = createTransactionContext({
				transaction,
			});

			commandExecuteContext =
				transactionContext.createCommandExecuteContext<TerminateSidechainForLivenessParams>(
					terminateSidechainForLivenessParamsSchema,
				);
			jest.spyOn(interopMod['internalMethod'], 'terminateChainInternal').mockResolvedValue();
		});

		it('should successfully terminate chain', async () => {
			await livenessTerminationCommand.execute(commandExecuteContext);
			expect(interopMod['internalMethod'].terminateChainInternal).toHaveBeenCalledWith(
				commandExecuteContext,
				transactionParams.chainID,
			);
		});
	});
});
