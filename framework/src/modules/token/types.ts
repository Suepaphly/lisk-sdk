/*
 * Copyright © 2020 Lisk Foundation
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

import { APIContext, ImmutableAPIContext } from '../../node/state_machine';

export type TokenID = Buffer;

export interface ModuleConfig {
	minBalances: {
		tokenID: string;
		amount: string;
	}[];
	supportedTokenIDs: string[];
}

export interface MinBalance {
	tokenID: Buffer;
	amount: bigint;
}

export interface GenesisTokenStore {
	userSubstore: {
		address: Buffer;
		tokenID: Buffer;
		availableBalance: bigint;
		lockedBalances: {
			moduleID: number;
			amount: bigint;
		}[];
	}[];
	supplySubstore: {
		localID: Buffer;
		totalSupply: bigint;
	}[];
	escrowSubstore: {
		escrowChainID: Buffer;
		localID: number;
		amount: bigint;
	}[];
	availableLocalIDSubstore: {
		nextAvailableLocalID: number;
	};
	terminatedEscrowSubstore: number[];
}

export interface InteroperabilityAPI {
	getOwnChainAccount(apiContext: ImmutableAPIContext): Promise<{ id: Buffer }>;
	send(
		apiContext: APIContext,
		feeAddress: Buffer,
		moduleID: number,
		crossChainCommandID: number,
		receivingChainID: Buffer,
		fee: bigint,
		status: number,
		parameters: Buffer,
	): Promise<boolean>;
}
