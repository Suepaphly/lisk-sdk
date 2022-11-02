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
import { ImmutableStoreGetter, StoreGetter } from '../../../base_store';
import { BaseInteroperabilityCCCommand } from '../../base_interoperability_cc_commands';
import { CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED, MAINCHAIN_ID } from '../../constants';
import { createCCMsgBeforeSendContext } from '../../context';
import { sidechainTerminatedCCMParamsSchema } from '../../schemas';
import { TerminatedStateStore } from '../../stores/terminated_state';
import { CCCommandExecuteContext } from '../../types';
import { getIDAsKeyForStore } from '../../utils';
import { SidechainInteroperabilityInternalMethod } from '../store';

interface CCMSidechainTerminatedParams {
	chainID: Buffer;
	stateRoot: Buffer;
}

export class SidechainCCSidechainTerminatedCommand extends BaseInteroperabilityCCCommand {
	public schema = sidechainTerminatedCCMParamsSchema;

	public get name(): string {
		return CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED;
	}

	public async execute(context: CCCommandExecuteContext): Promise<void> {
		const { ccm } = context;
		if (!ccm) {
			throw new Error('CCM to execute sidechain terminated cross chain command is missing.');
		}
		const ccmSidechainTerminatedParams = codec.decode<CCMSidechainTerminatedParams>(
			sidechainTerminatedCCMParamsSchema,
			ccm.params,
		);
		const interoperabilityInternalMethod = this.getInteroperabilityInternalMethod(context);

		if (ccm.sendingChainID.equals(getIDAsKeyForStore(MAINCHAIN_ID))) {
			const isTerminated = await this.stores
				.get(TerminatedStateStore)
				.get(context, ccmSidechainTerminatedParams.chainID);

			if (isTerminated) {
				return;
			}
			await interoperabilityInternalMethod.createTerminatedStateAccount(
				context,
				ccmSidechainTerminatedParams.chainID,
				ccmSidechainTerminatedParams.stateRoot,
			);
		} else {
			const beforeSendContext = createCCMsgBeforeSendContext({
				ccm,
				eventQueue: context.eventQueue,
				getMethodContext: context.getMethodContext,
				getStore: context.getStore,
				logger: context.logger,
				chainID: context.chainID,
				feeAddress: context.feeAddress,
			});
			await interoperabilityInternalMethod.terminateChainInternal(
				ccm.sendingChainID,
				beforeSendContext,
			);
		}
	}

	protected getInteroperabilityInternalMethod(
		context: StoreGetter | ImmutableStoreGetter,
	): SidechainInteroperabilityInternalMethod {
		return new SidechainInteroperabilityInternalMethod(
			this.stores,
			this.events,
			context,
			this.interoperableCCMethods,
		);
	}
}
