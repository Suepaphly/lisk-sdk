/*
 * Copyright © 2017 Lisk Foundation
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
import { Buffer } from 'buffer';
import bignum from 'browserify-bignum';
import crypto from 'crypto-browserify';
import hash from './hash';
import { getBytes } from '../transactions/transactionBytes';

/**
 * @method bufferToHex
 * @param buffer
 *
 * @return {string}
 */

function bufferToHex(buffer) {
	return naclInstance.to_hex(buffer);
}

/**
 * @method hexToBuffer
 * @param hex
 *
 * @return {buffer}
 */

function hexToBuffer(hex) {
	return naclInstance.from_hex(hex);
}

/**
 * @method useFirstEightBufferEntriesReversed
 * @param publicKeyBytes
 *
 * @return {buffer}
 */


// TODO: Discuss behaviour and output format
function useFirstEightBufferEntriesReversed(publicKeyBytes) {
	return Buffer.from(publicKeyBytes)
		.slice(0, 8)
		.reverse();
}

/**
 * @method toAddress
 * @param buffer
 *
 * @return {string}
 */

function toAddress(buffer) {
	return `${bignum.fromBuffer(buffer).toString()}L`;
}

/**
 * @method getAddress
 * @param publicKey string
 *
 * @return {string}
 */

function getAddress(publicKey) {
	const publicKeyHash = hash.getSha256Hash(publicKey, 'hex');
	const firstEntriesReversed = useFirstEightBufferEntriesReversed(publicKeyHash);

	return toAddress(firstEntriesReversed);
}

/**
 * @method getId
 * @param transaction Object
 *
 * @return {string}
 */

function getId(transaction) {
	const transactionBytes = getBytes(transaction);
	const transactionHash = crypto.createHash('sha256').update(transactionBytes).digest();
	const bufferFromFirstEntriesReversed = transactionHash.slice(0, 8).reverse();
	const firstEntriesToNumber = bignum.fromBuffer(bufferFromFirstEntriesReversed);

	return firstEntriesToNumber.toString();
}

module.exports = {
	bufferToHex,
	hexToBuffer,
	useFirstEightBufferEntriesReversed,
	toAddress,
	getAddress,
	getId,
};
