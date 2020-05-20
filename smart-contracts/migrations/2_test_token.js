const { getAccountAddress } = require('@blockrocket/utils');
const TestToken = artifacts.require("TestToken");

const MNEMONIC = process.env.ESCROW_MNEMONIC || '';
const INFURA_KEY = process.env.ESCROW_INFURA_KEY || '';

module.exports = async function (deployer, network, accounts) {
    console.log("Deploying test token to network: " + network);

    const creator = getAccountAddress(accounts, 0, network, MNEMONIC, INFURA_KEY);

    await deployer.deploy(TestToken, {from: creator});
    const token = await TestToken.deployed();
    console.log('token.address', token.address);
};
