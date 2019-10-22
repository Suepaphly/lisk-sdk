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
 *
 */
import { expect } from 'chai';
import {
	createSignatureObject,
	SignatureObject,
} from '../src/create_signature_object';
import { TransactionJSON } from '../src/transaction_types';

describe.skip('#createSignatureObject', () => {
	const transaction = {
		senderPublicKey:
			'5d036a858ce89f844491762eb89e2bfbd50a4a0a0da658e4b2628b25b117ae09',
		timestamp: 0,
		type: 0,
		asset: {
			recipientId: '1L',
			amount: '10000',
			data: 'dark army',
		},
		signature:
			'fd8b1931b63c95285eac83d21fc280b0c064e03187934ec3548499ab277334b0be7689c6d14c587abb43e990c9af1553d3b0476489ebed067bacb324b682c80b',
		id: '5746965060498095971',
	};
	const account = {
		passphrase: 'secret',
		publicKey:
			'5d036a858ce89f844491762eb89e2bfbd50a4a0a0da658e4b2628b25b117ae09',
	};
	const generatedSignature =
		'05a501135814de3e10126580597cfa25f9a40d89acf0fea206549e47ba7b961d8be3fe94e339b26b5e986c0b86ee9a5c6c27706c1446e8ca1a4e254a036d4503';
	const networkIdentifier =
		'e48feb88db5b5cf5ad71d93cdcd1d879b6d5ed187a36b0002cc34e0ef9883255';

	describe('when invalid transaction is used', () => {
		it("should throw an Error when id doesn't exist", () => {
			const { id, ...mutatedTransaction } = transaction;
			return expect(
				createSignatureObject.bind(null, {
					transaction: mutatedTransaction as TransactionJSON,
					passphrase: account.passphrase,
					networkIdentifier: networkIdentifier,
				}),
			).to.throw('Transaction ID is required to create a signature object.');
		});
		it('should throw an Error when sender public key is mutated', () => {
			const mutatedTransaction = {
				...transaction,
				senderPublicKey:
					'3358a1562f9babd523a768e700bb12ad58f230f84031055802dc0ea58cef1000',
			};
			return expect(
				createSignatureObject.bind(null, {
					transaction: mutatedTransaction,
					passphrase: account.passphrase,
					networkIdentifier,
				}),
			).to.throw('Invalid transaction.');
		});

		it('should throw an Error when signature is mutated', () => {
			const mutatedTransaction = {
				...transaction,
				signature:
					'b84b95087c381ad25b5701096e2d9366ffd04037dcc941cd0747bfb0cf93111834a6c662f149018be4587e6fc4c9f5ba47aa5bbbd3dd836988f153aa8258e600',
			};
			return expect(
				createSignatureObject.bind(null, {
					transaction: mutatedTransaction,
					passphrase: account.passphrase,
					networkIdentifier,
				}),
			).to.throw('Invalid transaction.');
		});
	});

	describe('when valid transaction and invalid passphrase is used', () => {
		it('should throw an Error if passphrase is number', () => {
			const passphrase = 1;
			return expect(
				createSignatureObject.bind(null, {
					transaction,
					passphrase: (passphrase as unknown) as string,
					networkIdentifier,
				}),
			).to.throw(
				'Unsupported data format. Currently only Buffers or `hex` and `utf8` strings are supported.',
			);
		});
	});

	describe('when valid transaction and passphrase is used', () => {
		let signatureObject: SignatureObject;
		beforeEach(() => {
			signatureObject = createSignatureObject({
				transaction: transaction as TransactionJSON,
				passphrase: account.passphrase,
				networkIdentifier,
			});
			return Promise.resolve();
		});

		it('should have the same transaction id as the input', () => {
			return expect(signatureObject.transactionId).to.equal(transaction.id);
		});

		it('should have the corresponding public key with the passphrase', () => {
			return expect(signatureObject.publicKey).to.equal(account.publicKey);
		});

		it('should have non-empty hex string signature', () => {
			return expect(signatureObject.signature).to.equal(generatedSignature);
		});
	});
});
