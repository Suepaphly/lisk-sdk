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

import { hash, verifyData } from '@liskhq/lisk-cryptography';
import { NotFoundError } from '@liskhq/lisk-chain';
import { UnlockingObject, VoterData } from './types';
import {
	PUNISHMENT_PERIOD,
	VOTER_PUNISH_TIME,
	WAIT_TIME_SELF_VOTE,
	WAIT_TIME_VOTE,
} from './constants';
import { SubStore } from '../../node/state_machine/types';
import { voterStoreSchema } from './schemas';
import { Validator } from '../../node/consensus/types';

export const sortUnlocking = (unlocks: UnlockingObject[]): void => {
	unlocks.sort((a, b) => {
		if (!a.delegateAddress.equals(b.delegateAddress)) {
			return a.delegateAddress.compare(b.delegateAddress);
		}
		if (a.unvoteHeight !== b.unvoteHeight) {
			return b.unvoteHeight - a.unvoteHeight;
		}
		const diff = b.amount - a.amount;
		if (diff > BigInt(0)) {
			return 1;
		}
		if (diff < BigInt(0)) {
			return -1;
		}

		return 0;
	});
};

export const isNullCharacterIncluded = (input: string): boolean =>
	new RegExp(/\\0|\\u0000|\\x00/).test(input);

export const isUsername = (username: string): boolean => {
	if (isNullCharacterIncluded(username)) {
		return false;
	}

	if (username !== username.trim().toLowerCase()) {
		return false;
	}

	return /^[a-z0-9!@$&_.]+$/g.test(username);
};

export const validateSignature = (
	tag: string,
	networkIdentifier: Buffer,
	publicKey: Buffer,
	signature: Buffer,
	bytes: Buffer,
): boolean => verifyData(tag, networkIdentifier, bytes, signature, publicKey);

export const getVoterOrDefault = async (voterStore: SubStore, address: Buffer) => {
	try {
		const voterData = await voterStore.getWithSchema<VoterData>(address, voterStoreSchema);
		return voterData;
	} catch (error) {
		if (!(error instanceof NotFoundError)) {
			throw error;
		}

		const voterData = {
			sentVotes: [],
			pendingUnlocks: [],
		};
		return voterData;
	}
};

export interface DelegateWeight {
	readonly delegateAddress: Buffer;
	readonly delegateWeight: bigint;
}

export const pickStandByDelegate = (
	delegateWeights: ReadonlyArray<DelegateWeight>,
	randomSeed: Buffer,
): number => {
	const seedNumber = randomSeed.readBigUInt64BE();
	const totalVoteWeight = delegateWeights.reduce(
		(prev, current) => prev + BigInt(current.delegateWeight),
		BigInt(0),
	);

	let threshold = seedNumber % totalVoteWeight;
	for (let i = 0; i < delegateWeights.length; i += 1) {
		const voteWeight = BigInt(delegateWeights[i].delegateWeight);
		if (voteWeight > threshold) {
			return i;
		}
		threshold -= voteWeight;
	}

	return -1;
};

export const shuffleDelegateList = (
	previousRoundSeed1: Buffer,
	addresses: ReadonlyArray<Buffer>,
): Buffer[] => {
	const delegateList = [...addresses].map(delegate => ({
		address: delegate,
	})) as { address: Buffer; roundHash: Buffer }[];

	for (const delegate of delegateList) {
		const seedSource = Buffer.concat([previousRoundSeed1, delegate.address]);
		delegate.roundHash = hash(seedSource);
	}

	delegateList.sort((delegate1, delegate2) => {
		const diff = delegate1.roundHash.compare(delegate2.roundHash);
		if (diff !== 0) {
			return diff;
		}

		return delegate1.address.compare(delegate2.address);
	});

	return delegateList.map(delegate => delegate.address);
};

export const selectStandbyDelegates = (
	delegateWeights: DelegateWeight[],
	randomSeed1: Buffer,
	randomSeed2?: Buffer,
): Buffer[] => {
	const numberOfCandidates = 1 + (randomSeed2 !== undefined ? 1 : 0);
	// if delegate weights is smaller than number selecting, select all
	if (delegateWeights.length <= numberOfCandidates) {
		return delegateWeights.map(c => c.delegateAddress);
	}
	const result: Buffer[] = [];
	const index = pickStandByDelegate(delegateWeights, randomSeed1);
	const [selected] = delegateWeights.splice(index, 1);
	result.push(selected.delegateAddress);
	// if seed2 is missing, return only 1
	if (!randomSeed2) {
		return result;
	}
	const secondIndex = pickStandByDelegate(delegateWeights, randomSeed2);
	const [secondStandby] = delegateWeights.splice(secondIndex, 1);
	result.push(secondStandby.delegateAddress);

	return result;
};

export const validtorsEqual = (v1: Validator[], v2: Validator[]): boolean => {
	if (v1.length !== v2.length) {
		return false;
	}
	for (let i = 0; i < v1.length; i += 1) {
		if (!v1[i].address.equals(v2[i].address)) {
			return false;
		}
		if (v1[i].bftWeight !== v2[i].bftWeight) {
			return false;
		}
	}

	return true;
};

export const isCurrentlyPunished = (height: number, pomHeights: ReadonlyArray<number>): boolean => {
	if (pomHeights.length === 0) {
		return false;
	}
	const lastPomHeight = Math.max(...pomHeights);
	if (height - lastPomHeight < PUNISHMENT_PERIOD) {
		return true;
	}

	return false;
};

export const hasWaited = (
	unlockingObject: UnlockingObject,
	senderAddress: Buffer,
	height: number,
) => {
	const delayedAvailability = unlockingObject.delegateAddress.equals(senderAddress)
		? WAIT_TIME_SELF_VOTE
		: WAIT_TIME_VOTE;

	return !(height - unlockingObject.unvoteHeight < delayedAvailability);
};

export const isPunished = (
	unlockingObject: UnlockingObject,
	pomHeights: ReadonlyArray<number>,
	senderAddress: Buffer,
	height: number,
) => {
	if (!pomHeights.length) {
		return false;
	}

	const lastPomHeight = pomHeights[pomHeights.length - 1];

	// If self-vote
	if (unlockingObject.delegateAddress.equals(senderAddress)) {
		return (
			height - lastPomHeight < PUNISHMENT_PERIOD &&
			lastPomHeight < unlockingObject.unvoteHeight + WAIT_TIME_SELF_VOTE
		);
	}

	return (
		height - lastPomHeight < VOTER_PUNISH_TIME &&
		lastPomHeight < unlockingObject.unvoteHeight + WAIT_TIME_VOTE
	);
};
