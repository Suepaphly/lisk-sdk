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

import { getRandomBytes } from '@liskhq/lisk-cryptography';
import { CCChannelTerminatedCommand } from '../../../../../../src/modules/interoperability/mainchain/cc_commands/channel_terminated';
import { SidechainInteroperabilityStore } from '../../../../../../src/modules/interoperability/sidechain/store';
import { CCCommandExecuteContext } from '../../../../../../src/modules/interoperability/types';
import { createExecuteCCMsgAPIContext } from '../../../../../../src/testing';

describe('CCChannelTerminatedCommand', () => {
	const createTerminatedStateAccountMock = jest.fn();

	const ccAPIMod1 = {
		beforeSendCCM: jest.fn(),
		beforeApplyCCM: jest.fn(),
	};
	const ccAPIMod2 = {
		beforeSendCCM: jest.fn(),
		beforeApplyCCM: jest.fn(),
	};
	const ccAPIsMap = new Map();
	ccAPIsMap.set(1, ccAPIMod1);
	ccAPIsMap.set(2, ccAPIMod2);
	const networkIdentifier = getRandomBytes(32);
	const ccm = {
		nonce: BigInt(0),
		moduleID: 1,
		crossChainCommandID: 1,
		sendingChainID: 2,
		receivingChainID: 3,
		fee: BigInt(20000),
		status: 0,
		params: Buffer.alloc(0),
	};
	const sampleExecuteContext: CCCommandExecuteContext = createExecuteCCMsgAPIContext({
		ccm,
		networkIdentifier,
	});

	const ccChannelTerminatedCommand = new CCChannelTerminatedCommand(1, ccAPIsMap);
	const mainchainInteroperabilityStore = new SidechainInteroperabilityStore(
		ccm.moduleID,
		sampleExecuteContext.getStore,
		ccAPIsMap,
	);
	mainchainInteroperabilityStore.createTerminatedStateAccount = createTerminatedStateAccountMock;
	(ccChannelTerminatedCommand as any)['getInteroperabilityStore'] = jest
		.fn()
		.mockReturnValue(mainchainInteroperabilityStore);

	describe('execute', () => {
		it('should call validators API registerValidatorKeys', async () => {
			await ccChannelTerminatedCommand.execute(sampleExecuteContext);

			expect(createTerminatedStateAccountMock).toHaveBeenCalledWith(ccm.sendingChainID);
		});
	});
});
