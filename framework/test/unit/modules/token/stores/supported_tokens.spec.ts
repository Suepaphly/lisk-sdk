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

import { StoreGetter } from '../../../../../src';
import {
	ALL_SUPPORTED_TOKENS_KEY,
	SupportedTokensStore,
} from '../../../../../src/modules/token/stores/supported_tokens';
import { PrefixedStateReadWriter } from '../../../../../src/state_machine/prefixed_state_read_writer';
import { InMemoryPrefixedStateDB } from '../../../../../src/testing/in_memory_prefixed_state';
import { createStoreGetter } from '../../../../../src/testing/utils';

describe('SupportedTokensStore', () => {
	const ownChainID = Buffer.from([1, 0, 0, 1]);

	let store: SupportedTokensStore;
	let context: StoreGetter;

	beforeEach(() => {
		store = new SupportedTokensStore('token', 3);
		const db = new InMemoryPrefixedStateDB();
		const stateStore = new PrefixedStateReadWriter(db);
		context = createStoreGetter(stateStore);

		store.registerOwnChainID(ownChainID);
	});

	describe('allSupported', () => {
		it('should return true if only key is ALL_SUPPORTED_TOKENS_KEY', async () => {
			await store.set(context, ALL_SUPPORTED_TOKENS_KEY, { supportedTokenIDs: [] });

			await expect(store.allSupported(context)).resolves.toBeTrue();
		});

		it('should return false if there is other supported keys', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), { supportedTokenIDs: [] });

			await expect(store.allSupported(context)).resolves.toBeFalse();
		});
	});

	describe('isSupported', () => {
		it('should return true if tokenID is native token', async () => {
			await expect(
				store.isSupported(context, Buffer.from([1, 0, 0, 1, 0, 0, 0, 0])),
			).resolves.toBeTrue();
		});

		it('should return true if tokenID is LSK', async () => {
			await store.set(context, Buffer.from([1, 0, 0, 0]), { supportedTokenIDs: [] });

			await expect(
				store.isSupported(context, Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])),
			).resolves.toBeTrue();
		});

		it('should return false if token is from mainchain but not LSK', async () => {
			await expect(
				store.isSupported(context, Buffer.from([1, 0, 0, 0, 0, 0, 0, 1])),
			).resolves.toBeFalse();
		});

		it('should return false if tokenID is LSK but different network', async () => {
			await expect(
				store.isSupported(context, Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])),
			).resolves.toBeFalse();
		});

		it('should return true if chainID is supported', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), { supportedTokenIDs: [] });

			await expect(
				store.isSupported(context, Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])),
			).resolves.toBeTrue();
		});

		it('should return false if chainID is supported but not this token', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])],
			});

			await expect(
				store.isSupported(context, Buffer.from([1, 1, 1, 1, 0, 0, 0, 1])),
			).resolves.toBeFalse();
		});

		it('should return true if chainID is supported and this token', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])],
			});

			await expect(
				store.isSupported(context, Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])),
			).resolves.toBeTrue();
		});

		it('should return true if all tokens are supported', async () => {
			await store.supportAll(context);

			await expect(store.isSupported(context, Buffer.alloc(8))).resolves.toBeTrue();
		});
	});

	describe('supportAll', () => {
		it('should remove all other keys and insert ALL_SUPPORTED_TOKENS_KEY', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])],
			});

			await store.supportAll(context);

			await expect(store.allSupported(context)).resolves.toBeTrue();
		});
	});

	describe('removeAll', () => {
		it('should remove all other keys', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])],
			});

			await store.removeAll(context);

			await expect(store.allSupported(context)).resolves.toBeFalse();
		});
	});

	describe('supportChain', () => {
		it('should not insert data if chainID is LSK', async () => {
			await store.set(context, ALL_SUPPORTED_TOKENS_KEY, { supportedTokenIDs: [] });
			await store.supportChain(context, Buffer.from([1, 0, 0, 0]));

			await expect(store.has(context, Buffer.from([1, 0, 0, 0]))).resolves.toBeFalse();
		});

		it('should not insert data if chainID is own chain', async () => {
			await store.supportChain(context, ownChainID);

			await expect(store.has(context, ownChainID)).resolves.toBeFalse();
		});

		it('should not insert data if all chain is supported', async () => {
			await store.set(context, ALL_SUPPORTED_TOKENS_KEY, { supportedTokenIDs: [] });
			await store.supportChain(context, Buffer.from([2, 0, 0, 0]));

			await expect(store.allSupported(context)).resolves.toBeTrue();
			await expect(
				store.isSupported(context, Buffer.from([2, 0, 0, 0, 0, 0, 0, 0])),
			).resolves.toBeTrue();
		});

		it('should insert data with empty list', async () => {
			await store.supportChain(context, Buffer.from([2, 0, 0, 0]));

			await expect(
				store.isSupported(context, Buffer.from([2, 0, 0, 0, 0, 0, 0, 0])),
			).resolves.toBeTrue();

			await expect(store.get(context, Buffer.from([2, 0, 0, 0]))).resolves.toEqual({
				supportedTokenIDs: [],
			});
		});

		it('should update data with empty list if tokens are supported', async () => {
			const chainID = Buffer.from([2, 0, 0, 0]);
			const tokenID = Buffer.concat([chainID, Buffer.from([1, 1, 1, 1])]);

			await store.set(context, chainID, { supportedTokenIDs: [tokenID] });

			await store.supportChain(context, chainID);

			await expect(store.get(context, chainID)).resolves.toEqual({ supportedTokenIDs: [] });
		});
	});

	describe('removeSupportForChain', () => {
		it('should not do anything if chain is native', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])],
			});

			await store.removeSupportForChain(context, ownChainID);

			await expect(store.has(context, Buffer.from([1, 1, 1, 1]))).resolves.toBeTrue();
		});

		it('should reject if chain is not supported', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])],
			});

			await expect(
				store.removeSupportForChain(context, Buffer.from([2, 2, 2, 2])),
			).resolves.toBeUndefined();
		});

		it('should remove support', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])],
			});

			await expect(
				store.removeSupportForChain(context, Buffer.from([1, 1, 1, 1])),
			).resolves.toBeUndefined();
			await expect(
				store.isSupported(context, Buffer.from([1, 1, 1, 1, 0, 0, 0, 0])),
			).resolves.toBeFalse();
		});
	});

	describe('supportToken', () => {
		it('should not insert data if chainID is LSK', async () => {
			await store.set(context, ALL_SUPPORTED_TOKENS_KEY, { supportedTokenIDs: [] });
			await store.supportToken(context, Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]));

			await expect(store.has(context, Buffer.from([1, 0, 0, 0]))).resolves.toBeFalse();
		});

		it('should not insert data if chainID is own chain', async () => {
			await store.supportToken(context, Buffer.concat([ownChainID, Buffer.from([0, 0, 0, 0])]));

			await expect(store.has(context, Buffer.from(ownChainID))).resolves.toBeFalse();
		});

		it('should not insert data if all chain is supported', async () => {
			await store.set(context, ALL_SUPPORTED_TOKENS_KEY, { supportedTokenIDs: [] });

			const tokenID = Buffer.from([2, 0, 0, 0, 1, 0, 0, 0]);
			await store.supportToken(context, tokenID);

			await expect(store.allSupported(context)).resolves.toBeTrue();
			await expect(store.has(context, Buffer.from([2, 0, 0, 0]))).resolves.toBeFalse();
		});

		it('should return undefined if all tokens are supported', async () => {
			await store.set(context, ALL_SUPPORTED_TOKENS_KEY, { supportedTokenIDs: [] });

			const tokenID = Buffer.from([2, 0, 0, 0, 1, 0, 0, 0]);
			await expect(store.supportToken(context, tokenID)).resolves.toBeUndefined();
			await expect(store.getAll(context)).resolves.toHaveLength(0);
		});

		it('should insert if there is no previous data', async () => {
			const tokenID = Buffer.from([2, 0, 0, 0, 1, 0, 0, 0]);
			await store.supportToken(context, tokenID);

			const supportedTokens = await store.get(context, Buffer.from([2, 0, 0, 0]));
			expect(supportedTokens.supportedTokenIDs).toHaveLength(1);
			expect(supportedTokens.supportedTokenIDs[0]).toEqual(tokenID);
		});

		it('should update if there is previous data', async () => {
			await store.set(context, Buffer.from([2, 0, 0, 0]), {
				supportedTokenIDs: [Buffer.from([2, 0, 0, 0, 1, 0, 0, 1])],
			});

			const tokenID = Buffer.from([2, 0, 0, 0, 1, 0, 0, 0]);
			await store.supportToken(context, tokenID);

			const supportedTokens = await store.get(context, Buffer.from([2, 0, 0, 0]));
			expect(supportedTokens.supportedTokenIDs).toHaveLength(2);
			expect(supportedTokens.supportedTokenIDs[0]).toEqual(tokenID);
		});

		it('should not update store for the chain if provided token is already supported', async () => {
			const tokenID = Buffer.from([2, 0, 0, 0, 1, 0, 0, 1]);
			const supportedTokensState = {
				supportedTokenIDs: [tokenID],
			};

			await store.set(context, Buffer.from([2, 0, 0, 0]), supportedTokensState);

			await store.supportToken(context, tokenID);

			const updatedSupportedTokens = await store.get(context, Buffer.from([2, 0, 0, 0]));

			expect(updatedSupportedTokens).toEqual(supportedTokensState);
		});
	});

	describe('removeSupportForToken', () => {
		it('should reject if chain is native', async () => {
			await expect(
				store.removeSupportForToken(context, Buffer.concat([ownChainID, Buffer.alloc(4)])),
			).rejects.toThrow('Cannot remove support for LSK or native token.');
		});

		it('should reject if token is LSK', async () => {
			await expect(
				store.removeSupportForToken(context, Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])),
			).rejects.toThrow('Cannot remove support for LSK or native token.');
		});

		it('should reject if all tokens are supported', async () => {
			await store.set(context, ALL_SUPPORTED_TOKENS_KEY, { supportedTokenIDs: [] });
			const tokenID = Buffer.from([2, 0, 0, 0, 1, 0, 0, 0]);
			await expect(store.removeSupportForToken(context, tokenID)).rejects.toThrow(
				'All tokens are supported.',
			);

			await expect(store.allSupported(context)).resolves.toBeTrue();
		});

		it('should remove chain from supported tokens if the only supported tokenID is removed', async () => {
			const tokenID = Buffer.from([1, 1, 1, 1, 1, 0, 0, 0]);
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [tokenID],
			});

			await expect(store.removeSupportForToken(context, tokenID)).resolves.toBeUndefined();
			await expect(store.has(context, Buffer.from([1, 1, 1, 1]))).resolves.toBeFalse();
		});

		it('should remove supported tokenID and keep other supported tokens', async () => {
			const tokenID = Buffer.from([1, 1, 1, 1, 1, 0, 0, 0]);
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [
					Buffer.from([1, 1, 1, 1, 1, 0, 1, 1]),
					tokenID,
					Buffer.from([1, 1, 1, 1, 1, 0, 0, 1]),
				],
			});

			await expect(store.removeSupportForToken(context, tokenID)).resolves.toBeUndefined();
			await expect(store.has(context, Buffer.from([1, 1, 1, 1]))).resolves.toBeTrue();
			await expect(store.get(context, Buffer.from([1, 1, 1, 1]))).resolves.toEqual({
				supportedTokenIDs: [
					Buffer.from([1, 1, 1, 1, 1, 0, 1, 1]),
					Buffer.from([1, 1, 1, 1, 1, 0, 0, 1]),
				],
			});
		});

		it('should not modify supported tokens store if a token that is not supported is the input', async () => {
			const chainID = Buffer.from([1, 1, 1, 1]);
			const notSupportedToken = Buffer.concat([chainID, Buffer.from([1, 0, 0, 0])]);

			const supportedTokensStoreState = {
				supportedTokenIDs: [
					Buffer.concat([chainID, Buffer.from([0, 0, 1, 1])]),
					Buffer.concat([chainID, Buffer.from([1, 0, 1, 1])]),
				],
			};

			await store.set(context, chainID, supportedTokensStoreState);

			await store.removeSupportForToken(context, notSupportedToken);

			await expect(store.get(context, chainID)).resolves.toEqual(supportedTokensStoreState);
		});

		it('should not modify store if support does not exist', async () => {
			await expect(
				store.removeSupportForToken(context, Buffer.from([1, 1, 1, 1, 1, 0, 0, 0])),
			).resolves.toBeUndefined();

			const chainID = Buffer.from([1, 1, 1, 1]);
			const tokenID = Buffer.from([1, 0, 0, 0]);

			await expect(
				store.removeSupportForToken(context, Buffer.concat([chainID, tokenID])),
			).resolves.toBeUndefined();

			await expect(store.has(context, chainID)).resolves.toBeFalse();
		});

		it('should reject if the supported tokens array length is 0', async () => {
			await store.set(context, Buffer.from([1, 1, 1, 1]), {
				supportedTokenIDs: [],
			});

			await expect(
				store.removeSupportForToken(context, Buffer.from([1, 1, 1, 1, 1, 0, 0, 0])),
			).rejects.toThrow('All tokens from the specified chain are supported.');
		});
	});
});
