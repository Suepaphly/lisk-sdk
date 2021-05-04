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
import { apiClient, cryptography, passphrase, codec } from '@liskhq/lisk-client';
import * as React from 'react';
import Box from '../components/Box';
import Button from '../components/Button';
import CopiableText from '../components/CopiableText';
import AccountDialog from '../components/dialogs/AccountDialog';
import NodeInfoDialog from '../components/dialogs/NodeInfoDialog';
import PeersInfoDialog from '../components/dialogs/PeersInfoDialog';
import Grid from '../components/Grid';
import InfoPanel from '../components/InfoPanel';
import { TextAreaInput } from '../components/input';
import Logo from '../components/Logo';
import Text from '../components/Text';
import Ticker from '../components/Ticker';
import { BlockWidget, RecentEventWidget, TransactionWidget } from '../components/widgets';
import CallActionWidget from '../components/widgets/CallActionWidget';
import MyAccountWidget from '../components/widgets/MyAccountWidget';
import SendTransactionWidget from '../components/widgets/SendTransactionWidget';
import useMessageDialog from '../providers/useMessageDialog';
import {
	Account,
	Block,
	NodeInfo,
	Transaction,
	EventData,
	SendTransactionOptions,
	CallActionOptions,
} from '../types';
import { getApplicationUrl, updateStatesOnNewBlock, updateStatesOnNewTransaction } from '../utils';
import useRefState from '../utils/useRefState';
import styles from './MainPage.module.scss';

const nodeInfoDefaultValue: NodeInfo = {
	version: '',
	networkVersion: '',
	networkIdentifier: '',
	syncing: false,
	unconfirmedTransactions: 0,
	height: 0,
	finalizedHeight: 0,
	lastBlockID: '',
	registeredModules: [],
	genesisConfig: {
		communityIdentifier: '',
		blockTime: 0,
		maxPayloadLength: 0,
		bftThreshold: 0,
		rewards: { milestones: [], offset: 0, distance: 0 },
		minFeePerByte: 0,
		baseFees: [],
	},
};

const connectionErrorMessage = (
	<Text type={'h3'}>
		There were some error and we were unable to connect to node. Try again by refreshing the page.
	</Text>
);

interface DashboardState {
	connected: boolean;
	applicationUrl?: string;
}

const callAndProcessActions = async (
	client: apiClient.APIClient,
	action: string,
	params: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
	let result = (await client.invoke(action, params)) as unknown;

	switch (action) {
		case 'app:getAccount':
			result = client.account.toJSON(client.account.decode(result as string));
			break;

		case 'app:getAccounts':
			result = (result as string[]).map(account =>
				client.account.toJSON(client.account.decode(account)),
			);
			break;

		case 'app:getLastBlock':
		case 'app:getBlockByID':
		case 'app:getBlockByHeight':
			result = client.block.toJSON(client.block.decode(result as string));
			break;

		case 'app:getBlocksByHeightBetween':
		case 'app:getBlocksByIDs':
			result = (result as string[]).map(block => client.block.toJSON(client.block.decode(block)));
			break;

		case 'app:getTransactionByID':
			result = client.transaction.toJSON(client.transaction.decode(result as string));
			break;

		case 'app:getTransactionsByIDs':
			result = (result as string[]).map(transaction =>
				client.transaction.toJSON(client.transaction.decode(transaction)),
			);
			break;

		default:
			break;
	}

	return result as Record<string, unknown>;
};

const MainPage: React.FC = () => {
	const { showMessageDialog } = useMessageDialog();

	// API Client object
	const [client, setClient] = React.useState<apiClient.APIClient>();
	// To cover apiClient.APIClient | undefined behavior
	const getClient = () => client as apiClient.APIClient;

	// Data States
	const [myAccounts, setMyAccounts] = React.useState<Account[]>([]);
	const [dashboard, setDashboard] = React.useState<DashboardState>({
		connected: false,
	});
	const [nodeInfo, setNodeInfo] = React.useState<NodeInfo>(nodeInfoDefaultValue);
	const [peersInfo, setPeerInfo] = React.useState({ connected: 0, disconnected: 0, banned: 0 });
	const [blocks, setBlocks, blocksRef] = useRefState<Block[]>([]);
	const [confirmedTransactions, setConfirmedTransactions, confirmedTransactionsRef] = useRefState<
		Transaction[]
	>([]);
	const [
		unconfirmedTransactions,
		setUnconfirmedTransactions,
		unconfirmedTransactionsRef,
	] = useRefState<Transaction[]>([]);
	const [events, setEvents] = React.useState<string[]>([]);
	const [eventsData, setEventsData, eventsDataRef] = useRefState<EventData[]>([]);
	const [eventSubscriptionList, setEventSubscriptionList, eventSubscriptionListRef] = useRefState<
		string[]
	>([]);
	const [actions, setActions] = React.useState<string[]>([]);

	// Dialogs related States
	const [showAccount, setShowAccount] = React.useState<Account>();
	const [nodeInfoDialog, setNodeInfoDialog] = React.useState(false);
	const [peersInfoDialog, setPeersInfoDialog] = React.useState(false);

	const newBlockListener = React.useCallback(
		async event => {
			const result = updateStatesOnNewBlock(
				getClient(),
				(event as { block: string }).block,
				blocksRef.current,
				confirmedTransactionsRef.current,
				unconfirmedTransactionsRef.current,
			);
			setBlocks(result.blocks);
			setConfirmedTransactions(result.confirmedTransactions);
			setUnconfirmedTransactions(result.unconfirmedTransactions);
			await loadNodeInfo();
		},
		[dashboard.connected],
	);

	const newTransactionListener = React.useCallback(
		event => {
			setUnconfirmedTransactions(
				updateStatesOnNewTransaction(
					getClient(),
					(event as { transaction: string }).transaction,
					unconfirmedTransactionsRef.current,
				),
			);
		},
		[dashboard.connected],
	);

	const newEventListener = React.useCallback(
		(name: string, event?: Record<string, unknown>) => {
			if (eventSubscriptionListRef.current.includes(name)) {
				eventsDataRef.current.unshift({ name, data: event ?? {} });
				setEventsData(eventsDataRef.current);
			}
		},
		[dashboard.connected],
	);

	const initClient = async () => {
		try {
			setClient(await apiClient.createWSClient(dashboard.applicationUrl as string));
			setDashboard({ ...dashboard, connected: true });
		} catch {
			showMessageDialog('Error connecting to node', connectionErrorMessage);
		}
	};

	const subscribeEvents = async () => {
		getClient().subscribe('app:block:new', newBlockListener);
		getClient().subscribe('app:transaction:new', newTransactionListener);
		setActions(await getClient().invoke<string[]>('app:getRegisteredActions'));

		const listOfEvents = await getClient().invoke<string[]>('app:getRegisteredEvents');
		listOfEvents.map(eventName =>
			getClient().subscribe(eventName, event => {
				newEventListener(eventName, event);
			}),
		);
		setEvents(listOfEvents);
	};

	const loadNodeInfo = async () => {
		setNodeInfo(await getClient().node.getNodeInfo());
	};

	const loadPeersInfo = async () => {
		const info = await getClient().node.getNetworkStats();
		setPeerInfo({
			connected: info.incoming.connects + info.outgoing.connects,
			disconnected: info.incoming.disconnects + info.outgoing.disconnects,
			banned: info.banning.totalBannedPeers,
		});
	};

	const generateNewAccount = () => {
		const accountPassphrase = (passphrase.Mnemonic.generateMnemonic() as unknown) as string;
		const { address, publicKey } = cryptography.getAddressAndPublicKeyFromPassphrase(
			accountPassphrase,
		);
		const lisk32Address = cryptography.getBase32AddressFromAddress(address);
		const newAccount: Account = {
			passphrase: accountPassphrase,
			publicKey: publicKey.toString('hex'),
			binaryAddress: address.toString('hex'),
			base32Address: lisk32Address,
		};

		setMyAccounts([newAccount, ...myAccounts]);
		setShowAccount(newAccount);
	};

	// Get connection string
	React.useEffect(() => {
		const initConnectionStr = async () => {
			setDashboard({ ...dashboard, applicationUrl: await getApplicationUrl() });
		};

		initConnectionStr().catch(console.error);
	}, []);

	// Init client
	React.useEffect(() => {
		if (dashboard.applicationUrl) {
			initClient().catch(console.error);
		}
	}, [dashboard.applicationUrl]);

	// Load data
	React.useEffect(() => {
		if (dashboard.connected) {
			subscribeEvents().catch(console.error);
			loadNodeInfo().catch(console.error);
			loadPeersInfo().catch(console.error);
		}
	}, [dashboard.connected]);

	// Refresh event subscriptions
	React.useEffect(() => {
		setEventsData([]);
	}, [eventSubscriptionList]);

	// Send Transaction
	const handleSendTransaction = async (data: SendTransactionOptions) => {
		try {
			const { publicKey, address } = cryptography.getAddressAndPublicKeyFromPassphrase(
				data.passphrase,
			);
			const assetSchema = getClient().schemas.transactionsAssets.find(
				a => a.moduleID === data.moduleID && a.assetID === data.assetID,
			);
			if (!assetSchema) {
				throw new Error(`ModuleID: ${data.moduleID} AssetID: ${data.assetID} is not registered`);
			}
			const assetObject = codec.codec.fromJSON<Record<string, unknown>>(
				assetSchema.schema,
				data.asset,
			);
			const sender = await getClient().account.get(address);
			const fee = getClient().transaction.computeMinFee({
				moduleID: data.moduleID,
				assetID: data.assetID,
				asset: assetObject,
				senderPublicKey: publicKey,
				nonce: BigInt((sender.sequence as { nonce: bigint }).nonce),
			});
			const transaction = await getClient().transaction.create(
				{
					moduleID: data.moduleID,
					assetID: data.assetID,
					asset: assetObject,
					senderPublicKey: publicKey,
					fee,
				},
				data.passphrase,
			);

			const resp = await getClient().transaction.send(transaction);

			showMessageDialog(
				'Success!',
				<React.Fragment>
					<Text type={'p'}>Transaction with following id received:</Text>
					<CopiableText text={resp.transactionId} />
				</React.Fragment>,
				{ backButton: true },
			);
		} catch (err) {
			showMessageDialog(
				'Error:',
				<React.Fragment>
					<Text type={'p'} color={'red'}>
						{(err as Error).message}
					</Text>
				</React.Fragment>,
			);
		}
	};

	const handleCallAction = async (data: CallActionOptions) => {
		try {
			const result = await callAndProcessActions(getClient(), data.name, data.params);
			showMessageDialog(
				'Success!',
				<TextAreaInput
					size={'l'}
					value={JSON.stringify(result, undefined, '  ')}
					json={true}
				></TextAreaInput>,
				{ backButton: true },
			);
		} catch (err) {
			showMessageDialog(
				'Error:',
				<React.Fragment>
					<Text type={'p'} color={'red'}>
						{(err as Error).message}
					</Text>
				</React.Fragment>,
			);
		}
	};

	const CurrentHeightPanel = () => (
		<InfoPanel title={'Current height'}>
			<Text color="green" type="h1" style="light">
				{nodeInfo.height.toLocaleString()}
			</Text>
		</InfoPanel>
	);

	const FinalizedHeightPanel = () => (
		<InfoPanel title={'Finalized height'}>
			<Text color="pink" type="h1" style="light">
				{nodeInfo.finalizedHeight.toLocaleString()}
			</Text>
		</InfoPanel>
	);

	const NextBlockPanel = () => (
		<InfoPanel title={'Next block'}>
			<Ticker
				color="yellow"
				type="h1"
				style="light"
				seconds={nodeInfo.genesisConfig.blockTime}
			></Ticker>
		</InfoPanel>
	);

	const PeersInfoPanel = () => (
		<InfoPanel title={'Peers'} onClick={() => setPeersInfoDialog(true)}>
			<Text color="blue" type="h1" style="light">
				{peersInfo.connected}
			</Text>
		</InfoPanel>
	);

	const NodeInfoPanel = () => (
		<InfoPanel mode={'light'} title={'Node Info'} onClick={() => setNodeInfoDialog(true)}>
			<Text color="white" type="p">
				Version: {nodeInfo.version}
			</Text>
		</InfoPanel>
	);

	return (
		<section className={styles.root}>
			<Grid container rowSpacing={6}>
				<Grid row alignItems={'center'}>
					<Grid xs={6} md={8}>
						<Logo name={'Lisk'} />
					</Grid>
					<Grid xs={6} md={4} textAlign={'right'}>
						<Button
							onClick={() => {
								generateNewAccount();
							}}
						>
							Generate new account
						</Button>
					</Grid>
				</Grid>
			</Grid>

			<Box showUp={'md'} hideDown={'md'}>
				<Grid container columns={15} colSpacing={2}>
					<Grid row>
						<Grid xs={3}>
							<CurrentHeightPanel />
						</Grid>
						<Grid xs={3}>
							<FinalizedHeightPanel />
						</Grid>
						<Grid xs={3}>
							<NextBlockPanel />
						</Grid>
						<Grid xs={3}>
							<PeersInfoPanel />
						</Grid>
						<Grid xs={3}>
							<NodeInfoPanel />
						</Grid>
					</Grid>
				</Grid>
			</Box>

			<Box hideUp={'xs'} showDown={'md'}>
				<Grid container columns={12} colSpacing={2}>
					<Grid row>
						<Grid xs={6}>
							<CurrentHeightPanel />
						</Grid>
						<Grid xs={6}>
							<FinalizedHeightPanel />
						</Grid>
					</Grid>
					<Grid row>
						<Grid xs={6}>
							<NextBlockPanel />
						</Grid>
						<Grid xs={6}>
							<PeersInfoPanel />
						</Grid>
					</Grid>
					<Grid row>
						<Grid xs={12}>
							<NodeInfoPanel />
						</Grid>
					</Grid>
				</Grid>
			</Box>

			<Grid container columns={12} colSpacing={3} rowSpacing={3}>
				<Grid row>
					<Grid md={6} xs={12}>
						<MyAccountWidget accounts={myAccounts} onSelect={account => setShowAccount(account)} />
					</Grid>
					<Grid md={6} xs={12}>
						<BlockWidget title="Recent Blocks" blocks={blocks}></BlockWidget>
					</Grid>
				</Grid>

				<Grid row>
					<Grid md={6} xs={12}>
						<TransactionWidget
							title="Recent Transactions"
							nodeInfo={nodeInfo}
							transactions={confirmedTransactions}
						></TransactionWidget>
					</Grid>
					<Grid md={6} xs={12}>
						<TransactionWidget
							title="Unconfirmed Transactions"
							nodeInfo={nodeInfo}
							transactions={unconfirmedTransactions}
						></TransactionWidget>
					</Grid>
				</Grid>

				<Grid row>
					<Grid md={6} xs={12}>
						<SendTransactionWidget
							modules={nodeInfo.registeredModules}
							onSubmit={data => {
								handleSendTransaction(data).catch(console.error);
							}}
						/>
					</Grid>
					<Grid md={6} xs={12}>
						<CallActionWidget
							actions={actions}
							onSubmit={data => {
								handleCallAction(data).catch(console.error);
							}}
						/>
					</Grid>
				</Grid>

				<Grid row>
					<Grid xs={12}>
						<RecentEventWidget
							events={events}
							onSelect={selectedEvents => setEventSubscriptionList(selectedEvents)}
							selected={[]}
							data={eventsData}
						/>
					</Grid>
				</Grid>

				<Grid row>
					<Grid xs={12}>
						<Text>© 2021 Lisk Foundation</Text>
					</Grid>
				</Grid>
			</Grid>

			<AccountDialog
				open={!!showAccount}
				onClose={() => {
					setShowAccount(undefined);
				}}
				account={showAccount as Account}
			></AccountDialog>

			<PeersInfoDialog
				open={peersInfoDialog}
				onClose={() => {
					setPeersInfoDialog(false);
				}}
				peersInfo={peersInfo}
			></PeersInfoDialog>

			<NodeInfoDialog
				open={nodeInfoDialog}
				onClose={() => {
					setNodeInfoDialog(false);
				}}
				nodeInfo={nodeInfo}
			></NodeInfoDialog>
		</section>
	);
};

export default MainPage;
