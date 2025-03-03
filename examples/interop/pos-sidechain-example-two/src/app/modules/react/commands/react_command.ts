/* eslint-disable class-methods-use-this */

import {
	BaseCommand,
	CommandVerifyContext,
	CommandExecuteContext,
	VerificationResult,
	VerifyStatus,
	codec,
} from 'lisk-sdk';
import { CROSS_CHAIN_COMMAND_NAME_REACT } from '../constants';
import {
	CCReactCommandParamsSchema,
	CCReactMessageParams,
	CCReactMessageParamsSchema,
	CCReactCommandParams,
} from '../schemas';
import { InteroperabilityMethod } from '../types';

export class ReactCrossChainCommand extends BaseCommand {
	private _interoperabilityMethod!: InteroperabilityMethod;
	public schema = CCReactCommandParamsSchema;

	public get name(): string {
		return CROSS_CHAIN_COMMAND_NAME_REACT;
	}

	public init(args: { interoperabilityMethod: InteroperabilityMethod }) {
		this._interoperabilityMethod = args.interoperabilityMethod;
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async verify(
		context: CommandVerifyContext<CCReactCommandParams>,
	): Promise<VerificationResult> {
		const { params, logger } = context;

		logger.info('+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
		logger.info(params);
		logger.info('+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');

		try {
			if (params.receivingChainID.equals(context.chainID)) {
				throw new Error('Receiving chain cannot be the sending chain.');
			}
		} catch (err) {
			return {
				status: VerifyStatus.FAIL,
				error: err as Error,
			};
		}
		return {
			status: VerifyStatus.OK,
		};
	}

	public async execute(context: CommandExecuteContext<CCReactCommandParams>): Promise<void> {
		const {
			params,
			transaction: { senderAddress },
		} = context;

		const reactCCM: CCReactMessageParams = {
			reactionType: params.reactionType,
			data: params.data,
			helloMessageID: params.helloMessageID,
		};

		await this._interoperabilityMethod.send(
			context.getMethodContext(),
			senderAddress,
			'hello',
			CROSS_CHAIN_COMMAND_NAME_REACT,
			params.receivingChainID,
			params.messageFee,
			codec.encode(CCReactMessageParamsSchema, reactCCM),
			context.header.timestamp,
		);
	}
}
