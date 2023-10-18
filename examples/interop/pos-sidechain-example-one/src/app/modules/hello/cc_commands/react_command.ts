/* eslint-disable class-methods-use-this */

import { BaseCCCommand, CrossChainMessageContext, codec, cryptography, db } from 'lisk-sdk';
import {
	crossChainReactParamsSchema,
	CCReactMessageParams,
	crossChainReactMessageSchema,
} from '../schema';
import { MAX_RESERVED_ERROR_STATUS, CROSS_CHAIN_COMMAND_NAME_REACT } from '../constants';
import { ReactionStore, ReactionStoreData } from '../stores/reaction';

export class ReactCCCommand extends BaseCCCommand {
	public schema = crossChainReactParamsSchema;

	public get name(): string {
		return CROSS_CHAIN_COMMAND_NAME_REACT;
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async verify(ctx: CrossChainMessageContext): Promise<void> {
		const { ccm } = ctx;

		if (ccm.status > MAX_RESERVED_ERROR_STATUS) {
			throw new Error('Invalid CCM status code.');
		}
	}

	public async execute(ctx: CrossChainMessageContext): Promise<void> {
		const { ccm, logger } = ctx;
		logger.info('Executing React CCM', 'df');
		// const methodContext = ctx.getMethodContext();
		// const { sendingChainID, status, receivingChainID } = ccm;
		const params = codec.decode<CCReactMessageParams>(crossChainReactMessageSchema, ccm.params);
		logger.info(params, 'df');
		const { helloMessageID, reactionType, senderAddress } = params;
		const reactionSubstore = this.stores.get(ReactionStore);

		logger.info({ helloMessageID }, 'Contents of helloMessageID');
		const messageCreatorAddress = cryptography.address.getAddressFromLisk32Address(
			helloMessageID.toString('utf-8'),
		);
		logger.info({ messageCreatorAddress }, 'Contents of messageCreatorAddress');

		let msgReactions: ReactionStoreData;

		const reactionsExist = await reactionSubstore.has(ctx, messageCreatorAddress);

		if (reactionsExist) {
			try {
				msgReactions = await reactionSubstore.get(ctx, messageCreatorAddress);
			} catch (error) {
				if (!(error instanceof db.NotFoundError)) {
					throw error;
				}

				logger.error({ error }, 'Error when getting the reaction substore');
				logger.info({ helloMessageID, crossChainCommand: this.name }, error.message);

				return;
			}
		} else {
			msgReactions = { reactions: { like: [] } };
		}

		logger.info(
			{ msgReactions },
			'+++++++++++++++++++++++++++++=============++++++++++++++++++++++++',
		);
		logger.info({ msgReactions }, 'Contents of the reaction store PRE');
		logger.info(msgReactions, 'Contents of the reaction store PRE');
		if (reactionType === 0) {
			// TODO: Check if the Likes array already contains the sender address. If yes, remove the address to unlike the post.
			msgReactions.reactions.like.push(senderAddress);
		} else {
			logger.error({ reactionType }, 'invalid reaction type');
		}

		logger.info(msgReactions, 'Contents of the reaction store POST');
		logger.info({ msgReactions }, 'Contents of the reaction store POST');
		await reactionSubstore.set(ctx, messageCreatorAddress, msgReactions);
	}
}
