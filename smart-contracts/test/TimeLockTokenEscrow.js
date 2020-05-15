const {accounts, contract} = require('@openzeppelin/test-environment');
const {BN, expectRevert, expectEvent, constants, time} = require('@openzeppelin/test-helpers');

const {ZERO_ADDRESS} = constants;
require('chai').should();

const TimeLockTokenEscrow = contract.fromArtifact('TimeLockTokenEscrow');
const TestToken = contract.fromArtifact('TestToken');

function now() {
    return Math.floor(Date.now() / 1000);
}

describe('TimeLockTokenEscrow V2 tests', function () {

    const [creator, beneficiary1, random] = accounts;

    beforeEach(async function () {
        this.initialSupply = new BN('1000000').mul(new BN('10').pow(new BN('18')));
        this.token = await TestToken.new({from: creator});
        this.timeLockTokenEscrow = await TimeLockTokenEscrow.new(this.token.address, {from: creator});
    });

    const lockupTokens = async function (token, escrowContract, beneficiary, amount, lockedUntil) {
        // Approve the contract first and check its allowance after
        await token.approve(escrowContract.address, amount, {from: creator});

        (await token.allowance(creator, escrowContract.address)).should.be.bignumber.equal(amount);

        // Lock up the tokens
        return await escrowContract.lock(beneficiary, amount, lockedUntil, {from: creator});
    };

    const amountToLockUp = new BN('5000');

    describe('lock() - Locking up tokens', function () {
        describe('happy path', function () {
            it('Locks up a specified amount of tokens', async function () {
                // Ensure timeLockTokenEscrow has no tokens
                (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal('0');

                const oneHourFromNow = new BN((now() + (60 * 60)).toString());

                const {logs} = await lockupTokens(
                    this.token,
                    this.timeLockTokenEscrow,
                    beneficiary1,
                    amountToLockUp,
                    oneHourFromNow
                );

                await expectEvent.inLogs(logs, 'Lockup', {
                    _depositId: '1',
                    _creator: creator,
                    _beneficiary: beneficiary1,
                    _amount: amountToLockUp,
                    _lockedUntil: oneHourFromNow
                });

                // Ensure timeLockTokenEscrow has tokens
                (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal('5000');
            });
        });

        describe('requires', function () {
            it('Fails to lockup tokens for address zero', async function () {
                await expectRevert(
                    this.timeLockTokenEscrow.lock(ZERO_ADDRESS, amountToLockUp, '0', {from: creator}),
                    'You cannot lock up tokens for the zero address'
                );
            });

            it('Fails when amount is zero', async function () {
                await expectRevert(
                    this.timeLockTokenEscrow.lock(beneficiary1, '0', '0', {from: creator}),
                    'Lock up amount of zero tokens is invalid'
                );
            });

            // FIXME
            it.skip('Fails when tokens have already been locked up for a beneficiary', async function () {
                // Lock up the tokens
                const oneHourFromNow = new BN((now() + (60 * 60)).toString());
                await lockupTokens(
                    this.token,
                    this.timeLockTokenEscrow,
                    beneficiary1,
                    amountToLockUp,
                    oneHourFromNow
                );

                // Try to lock up again
                await expectRevert(
                    this.timeLockTokenEscrow.lock(beneficiary1, amountToLockUp, '0', {from: creator}),
                    'Tokens have already been locked up for the given address'
                );
            });

            it('Fails when the contract is not approved to escrow tokens', async function () {
                await expectRevert(
                    this.timeLockTokenEscrow.lock(beneficiary1, amountToLockUp, '0', {from: creator}),
                    'The contract does not have enough of an allowance to escrow'
                );
            });
        });
    });

    describe('withdrawal() - Releasing the tokens', function () {
        describe('happy path', function () {
            it('Sends the token after the lockup period has ended', async function () {
                // Lock up the tokens
                const oneHourFromNow = new BN((now() + (60 * 60)).toString());
                await lockupTokens(
                    this.token,
                    this.timeLockTokenEscrow,
                    beneficiary1,
                    amountToLockUp,
                    oneHourFromNow
                );

                // Ensure beneficiary1 has no tokens
                (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal('0');

                // Fast forward time by over an hour
                await time.increaseTo(oneHourFromNow.add(new BN('3600')));

                const {logs} = await this.timeLockTokenEscrow.withdrawal(1, beneficiary1, {from: random});
                await expectEvent.inLogs(logs, 'Withdrawal', {
                    _depositId: '1',
                    _beneficiary: beneficiary1,
                    _caller: random,
                    _amount: amountToLockUp
                });

                // Check the balance of beneficiary1
                (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal(amountToLockUp);
            });

            it('Can re-lock up tokens after a withdrawal', async function () {
                await lockupTokens(
                    this.token,
                    this.timeLockTokenEscrow,
                    beneficiary1,
                    amountToLockUp,
                    new BN('0')
                );

                await this.timeLockTokenEscrow.withdrawal(1, beneficiary1, {from: random});

                await lockupTokens(
                    this.token,
                    this.timeLockTokenEscrow,
                    beneficiary1,
                    amountToLockUp,
                    new BN('0')
                );

                (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal(amountToLockUp);
            });
        });

        describe('requires', function () {
            it('Fails when no tokens are locked up for an address', async function () {
                await expectRevert(
                    this.timeLockTokenEscrow.withdrawal(1, random, {from: random}),
                    'There are no tokens locked up for this address'
                );
            });

            it('Fails when tokens have already been claimed', async function () {
                await lockupTokens(
                    this.token,
                    this.timeLockTokenEscrow,
                    beneficiary1,
                    amountToLockUp,
                    new BN('0')
                );

                await this.timeLockTokenEscrow.withdrawal(1, beneficiary1, {from: random});

                await expectRevert(
                    this.timeLockTokenEscrow.withdrawal(1, beneficiary1),
                    'There are no tokens locked up for this address'
                );
            });

            it('Fails when tokens are still within their lockup period', async function () {
                const fiveHoursFromNow = new BN((now() + ((60 * 60) * 5)).toString());
                await lockupTokens(
                    this.token,
                    this.timeLockTokenEscrow,
                    beneficiary1,
                    amountToLockUp,
                    fiveHoursFromNow
                );

                await expectRevert(
                    this.timeLockTokenEscrow.withdrawal(1, beneficiary1),
                    'Tokens are still locked up'
                );
            });
        });
    });

});
