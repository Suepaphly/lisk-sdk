/** eslint-disable */

const { codec } = require('@liskhq/lisk-codec');
const { ed, address, utils } = require('@liskhq/lisk-cryptography');
const { convertBeddowsToLSK } = require('@liskhq/lisk-transactions');
const { Transaction } = require('@liskhq/lisk-chain');
const fs = require('fs');

const { multisigRegMsgSchema } = require('./dist-node');
const {
	RegisterMultisignatureCommand,
} = require('./dist-node/modules/auth/commands/register_multisignature');

const chainID = Buffer.from([4, 0, 0, 0]);
const MESSAGE_TAG_MULTISIG_REG = 'LSK_RMSG_';
const randomUInt32 = () => utils.getRandomBytes(4).readUint32BE();
const randomUInt64 = () => utils.getRandomBytes(8).readBigUInt64BE();

multisigRegMsgSchema.properties.address.format = 'lisk32';

async function createActors(num = 5) {
	const secretKeys = await Promise.all(
		new Array(num)
			.fill(0)
			.map(async (_, i) => ed.getPrivateKeyFromPhraseAndPath('test test test', `m/44'/134'/${i}`)),
	);
	const actors = secretKeys.map(sk => ({
		privateKey: sk,
		publicKey: ed.getPublicKeyFromPrivateKey(sk),
	}));
	actors.sort((a1, a2) => a1.publicKey.compare(a2.publicKey));
	return actors;
}

async function createRegisterMultisigMessageFixtures(rootActor) {
	const actors = await createActors();

	const registrationData = {
		numberOfSignatures: 3,
		mandatoryKeys: [actors[0].publicKey, actors[1].publicKey],
		optionalKeys: [actors[2].publicKey, actors[3].publicKey, actors[4].publicKey],
	};

	const nonce = BigInt(Math.floor(Math.random() * 100000));
	const fixtures = actors.map((actor, i) => {
		const data = {
			...registrationData,
			nonce,
			address: address.getAddressFromPublicKey(rootActor.publicKey),
		};
		const encodedData = codec.encode(multisigRegMsgSchema, data);
		const jsonData = codec.toJSON(multisigRegMsgSchema, data);
		return {
			index: i,
			name: 'multi-signature registration message',
			publicKey: actor.publicKey.toString('hex'),
			privateKey: actor.privateKey.toString('hex'),
			tag: MESSAGE_TAG_MULTISIG_REG,
			chainID: chainID.toString('hex'),
			data: jsonData,
			blob: encodedData.toString('hex'),
			output: [
				`0 | Address: ${jsonData.address}`,
				`1 | Nonce: ${jsonData.nonce}`,
				`2 | Number of Signatures: ${jsonData.numberOfSignatures}`,
				`3 | Mandatory Keys: ${jsonData.mandatoryKeys.join(',')}`,
				`4 | Optional Keys: ${jsonData.optionalKeys.join(',')}`,
			],
			output_expert: [
				`0 | Address: ${jsonData.address}`,
				`1 | Nonce: ${jsonData.nonce}`,
				`2 | Number of Signatures: ${jsonData.numberOfSignatures}`,
				`3 | Mandatory Keys: ${jsonData.mandatoryKeys.join(',')}`,
				`4 | Optional Keys: ${jsonData.optionalKeys.join(',')}`,
			],
			signature: ed
				.signDataWithPrivateKey(MESSAGE_TAG_MULTISIG_REG, chainID, encodedData, actor.privateKey)
				.toString('hex'),
		};
	});

	return fixtures;
}

async function createDappFixtures() {
	const paramSchema = {
		$id: '/unknown/params',
		type: 'object',
		required: ['address', 'amount', 'index'],
		properties: {
			address: {
				dataType: 'bytes',
				fieldNumber: 1,
				format: 'lisk32',
			},
			amount: {
				dataType: 'uint64',
				fieldNumber: 2,
			},
			index: {
				dataType: 'uint32',
				fieldNumber: 3,
			},
		},
	};

	const actors = await createActors();

	const module = 'newModule';
	const command = 'newCommand';

	const fixtures = actors.map((actor, i) => {
		const fee = randomUInt64();
		const nonce = randomUInt64();
		const params = {
			address: utils.getRandomBytes(20),
			amount: randomUInt64(),
			index: randomUInt32(),
		};
		const encodedParams = codec.encode(paramSchema, params);

		const tx = new Transaction({
			module,
			command,
			fee,
			nonce,
			params: encodedParams,
			senderPublicKey: actor.publicKey,
			signatures: [],
		});

		const encodedTransaction = tx.getBytes();
		tx.sign(chainID, actor.privateKey);
		return {
			index: i,
			name: `${module}_${command}`,
			publicKey: actor.publicKey.toString('hex'),
			privateKey: actor.privateKey.toString('hex'),
			chainID: chainID.toString('hex'),
			data: tx.toJSON(),
			blob: encodedTransaction.toString('hex'),
			output: [
				`0 | Module : ${module}`,
				`1 | Command : ${command}`,
				`2 | Fee : ${convertBeddowsToLSK(fee.toString())}`,
				`3 | Params Hash: ${utils.hash(encodedParams).toString('hex')}`,
			],
			output_expert: [
				`0 | Module : ${module}`,
				`1 | Command : ${command}`,
				`2 | Fee : ${convertBeddowsToLSK(fee.toString())}`,
				`3 | Nonce : ${nonce.toString()}`,
				`4 | Params Hash: ${utils.hash(encodedParams).toString('hex')}`,
				`5 | Params: ${encodedParams.toString('hex')}`,
			],
			signature: tx.signatures[0].toString('hex'),
		};
	});
	return fixtures;
}

async function createRandomMsgFixtures() {
	const actors = await createActors();

	const data = utils.getRandomBytes(30);

	const fixtures = actors.map((actor, i) => {
		return {
			index: i,
			name: `developer defined title`,
			publicKey: actor.publicKey.toString('hex'),
			privateKey: actor.privateKey.toString('hex'),
			chainID: chainID.toString('hex'),
			blob: data.toString('hex'),
			output: [
				`0 | Message Hash: ${utils.hash(data).toString('hex')}`,
				`1 | Message: ${data.toString('hex')}`,
			],
			output_expert: [
				`0 | Message Hash: ${utils.hash(data).toString('hex')}`,
				`1 | Message: ${data.toString('hex')}`,
			],
			signature: ed.signData('USER_DEFINED_TAG_', chainID, data, actor.privateKey).toString('hex'),
		};
	});

	return fixtures;
}

(async () => {
	const [rootActor] = await createActors(1);
	const multisigMsgFixtures = await createRegisterMultisigMessageFixtures(rootActor);
	fs.writeFileSync(
		'./fixtures/register-multisig.json',
		JSON.stringify(multisigMsgFixtures, null, ' '),
	);

	// Show flow how to use the signed message to invoke "registerMultiSignature" command
	const data = {
		module: 'auth',
		command: 'registerMultiSignature',
		fee: BigInt(1_0000_0000),
		nonce: BigInt(20),
		senderPublicKey: rootActor.publicKey,
		params: codec.encode(new RegisterMultisignatureCommand().schema, {
			numberOfSignatures: multisigMsgFixtures[0].data.numberOfSignatures,
			mandatoryKeys: multisigMsgFixtures[0].data.mandatoryKeys.map(k => Buffer.from(k, 'hex')),
			optionalKeys: multisigMsgFixtures[0].data.optionalKeys.map(k => Buffer.from(k, 'hex')),
			signatures: multisigMsgFixtures.map(f => Buffer.from(f.signature, 'hex')),
		}),
		signatures: [],
	};
	const registerMultiSignatureTransaction = new Transaction(data);
	registerMultiSignatureTransaction.sign(chainID, rootActor.privateKey);
	console.log(registerMultiSignatureTransaction.toJSON());

	const dappFixtures = await createDappFixtures();
	fs.writeFileSync('./fixtures/dapp.json', JSON.stringify(dappFixtures, null, ' '));

	const randomMessageFixtures = await createRandomMsgFixtures();
	fs.writeFileSync(
		'./fixtures/random-message.json',
		JSON.stringify(randomMessageFixtures, null, ' '),
	);
})();
