export interface CreateHelloParams {
	message: string;
}

export const createHelloSchema = {
	$id: 'hello/createHello-params',
	title: 'CreateHelloCommand transaction parameter for the Hello module',
	type: 'object',
	required: ['message'],
	properties: {
		message: {
			dataType: 'string',
			fieldNumber: 1,
			minLength: 3,
			maxLength: 256,
		},
	},
};

export const configSchema = {
	$id: '/hello/config',
	type: 'object',
	properties: {
		maxMessageLength: {
			type: 'integer',
			format: 'uint32',
		},
		minMessageLength: {
			type: 'integer',
			format: 'uint32',
		},
		blacklist: {
			type: 'array',
			items: {
				type: 'string',
				minLength: 1,
				maxLength: 40,
			},
		},
	},
	required: ['maxMessageLength', 'minMessageLength', 'blacklist'],
};

export const getHelloCounterResponseSchema = {
	$id: 'modules/hello/endpoint/getHelloCounter',
	type: 'object',
	required: ['counter'],
	properties: {
		counter: {
			type: 'number',
			format: 'uint32',
		},
	},
};

export const getHelloResponseSchema = {
	$id: 'modules/hello/endpoint/getHello',
	type: 'object',
	required: ['message'],
	properties: {
		message: {
			type: 'string',
			format: 'utf8',
		},
	},
};

export const getHelloRequestSchema = {
	$id: 'modules/hello/endpoint/getHelloRequest',
	type: 'object',
	required: ['address'],
	properties: {
		address: {
			type: 'string',
			format: 'lisk32',
		},
	},
};

/**
 * Parameters of the reactCrossChain CCM
 */
export interface CCReactMessageParams {
	/**
	 * A number indicating the type of the reaction.
	 */
	reactionType: number;
	/**
	 * ID of the message.
	 */
	helloMessageID: string;
	/** Optional field for data / messages. */
	data: string;
}

/**
 * Schema for the parameters of the reactCrossChain CCM
 */
export const CCReactMessageParamsSchema = {
	/** The unique identifier of the schema. */
	$id: '/lisk/hello/ccReactParams',
	type: 'object',
	/** The required parameters for the command. */
	required: ['reactionType', 'helloMessageID', 'data'],
	/** A list describing the available parameters for the command. */
	properties: {
		reactionType: {
			dataType: 'uint32',
			fieldNumber: 1,
		},
		helloMessageID: {
			dataType: 'string',
			fieldNumber: 2,
		},
		data: {
			dataType: 'string',
			fieldNumber: 3,
			minLength: 0,
			maxLength: 64,
		},
	},
};
