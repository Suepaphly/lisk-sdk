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
 */

export const CommonBlock = {
	id: 'CommonBlock',
	type: 'object',
	required: ['id', 'height', 'previousBlockId'],
	properties: {
		id: {
			type: 'string',
			format: 'hex',
			minLength: 64,
			maxLength: 64,
			example: '6258354802676165798',
		},
		height: {
			type: 'integer',
			example: 123,
			minimum: 1,
		},
		previousBlockId: {
			type: 'string',
			format: 'hex',
			example: '15918760246746894806',
		},
	},
};

export const WSBlocksList = {
	id: 'WSBlocksList',
	type: 'array',
	items: {
		type: 'object',
	},
};

export const WSTransactionsResponse = {
	id: 'WSTransactionsResponse',
	type: 'object',
	required: ['transactions'],
	properties: {
		transactions: {
			type: 'array',
			uniqueItems: true,
			maxItems: 100,
			items: {
				type: 'object',
			},
		},
	},
};
