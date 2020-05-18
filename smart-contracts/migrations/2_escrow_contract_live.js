const { getAccountAddress } = require('@blockrocket/utils');
const TimeLockTokenEscrow = artifacts.require("TimeLockTokenEscrow");

const MNEMONIC = process.env.ESCROW_MNEMONIC || '';
const INFURA_KEY = process.env.ESCROW_INFURA_KEY || '';

module.exports = async function (deployer, network, accounts) {
    console.log("Deploying escrow contract to network: " + network);

    const creator = getAccountAddress(accounts, 0, network, MNEMONIC, INFURA_KEY);

    await deployer.deploy(TimeLockTokenEscrow, "0x6368e1E18c4C419DDFC608A0BEd1ccb87b9250fc", {from: creator});
    const escrow = await TimeLockTokenEscrow.deployed();
    console.log('escrow.address', escrow.address);
};
