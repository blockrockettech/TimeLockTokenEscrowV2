const {accounts, contract} = require('@openzeppelin/test-environment');
const {BN, expectRevert, expectEvent, constants, time} = require('@openzeppelin/test-helpers');

const {ZERO_ADDRESS} = constants;
require('chai').should();

const TimeLockTokenEscrow = contract.fromArtifact('TimeLockTokenEscrow');
const TestToken = contract.fromArtifact('TestToken');

describe('TimeLockTokenEscrow V2 tests', async () => {

    const [creator, beneficiary1, beneficiary2, random] = accounts;

    beforeEach(async () => {
        this.initialSupply = new BN('1000000').mul(new BN('10').pow(new BN('18')));
        this.token = await TestToken.new({from: creator});
        this.timeLockTokenEscrow = await TimeLockTokenEscrow.new(this.token.address, {from: creator});

        this.now = await time.latest();
        this.thirtyMinsFromNow = new BN(this.now.add(new BN('1800')));
        this.oneHourFromNow = new BN(this.now.add(new BN('3600')));
        this.twoHourFromNow = new BN(this.now.add(new BN('7200')));
    });

    const lockupTokens = async (beneficiary, amount, lockedUntil) => {
        // Approve the contract first and check its allowance after
        await this.token.approve(this.timeLockTokenEscrow.address, amount, {from: creator});

        (await this.token.allowance(creator, this.timeLockTokenEscrow.address)).should.be.bignumber.equal(amount);

        // Lock up the tokens
        return await this.timeLockTokenEscrow.lock(beneficiary, amount, lockedUntil, {from: creator});
    };

    const validDeposit = async (id, beneficiary, {creator, amount, lockedUntil}) => {
        const {_creator, _amount, _lockedUntil} = await this.timeLockTokenEscrow.getLockForDepositIdAndBeneficiary(id, beneficiary);
        _creator.should.be.equal(creator);
        _amount.should.be.bignumber.equal(amount);
        _lockedUntil.should.be.bignumber.equal(lockedUntil);
    };

    const amountToLockUp = new BN('5000');
    const secondAmountToLockUp = new BN('2500');

    describe('lock() - Locking up tokens', async () => {

        describe('happy path', async () => {

            beforeEach(async () => {
                // Ensure timeLockTokenEscrow has no tokens
                (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal('0');

                this.receipt = await lockupTokens(
                    beneficiary1,
                    amountToLockUp,
                    this.oneHourFromNow
                );
            });

            it('Locks up a specified amount of tokens', async () => {
                await expectEvent(this.receipt, 'Lockup', {
                    _depositId: '1',
                    _creator: creator,
                    _beneficiary: beneficiary1,
                    _amount: amountToLockUp,
                    _lockedUntil: this.oneHourFromNow
                });

                // Ensure timeLockTokenEscrow has tokens
                (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal('5000');
            });

            it('Reverse mapping setup for new deposit and beneficiary', async () => {
                const depositIds = await this.timeLockTokenEscrow.getDepositIdsForBeneficiary(beneficiary1);
                depositIds.should.be.lengthOf(1);
                depositIds[0].should.be.bignumber.equal('1');
            });

            it('TimeLock data correctly set', async () => {
                await validDeposit('1', beneficiary1, {
                    creator: creator,
                    amount: amountToLockUp,
                    lockedUntil: this.oneHourFromNow,
                });
            });

        });

        describe('requires', async () => {

            it('Fails to lockup tokens for address zero', async () => {
                await expectRevert(
                    this.timeLockTokenEscrow.lock(ZERO_ADDRESS, amountToLockUp, '0', {from: creator}),
                    'You cannot lock up tokens for the zero address'
                );
            });

            it('Fails when amount is zero', async () => {
                await expectRevert(
                    this.timeLockTokenEscrow.lock(beneficiary1, '0', '0', {from: creator}),
                    'Lock up amount of zero tokens is invalid'
                );
            });
        });
    });

    describe('withdrawal() - Releasing the tokens', async () => {
        describe('happy path', async () => {
            it('Sends the token after the lockup period has ended', async () => {
                // Lock up the tokens
                await lockupTokens(
                    beneficiary1,
                    amountToLockUp,
                    this.oneHourFromNow
                );

                // Ensure beneficiary1 has no tokens
                (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal('0');

                // Fast forward time by over an hour
                await time.increaseTo(this.oneHourFromNow.add(new BN('3600')));

                const receipt = await this.timeLockTokenEscrow.withdrawal(1, beneficiary1, {from: random});
                await expectEvent(receipt, 'Withdrawal', {
                    _depositId: '1',
                    _beneficiary: beneficiary1,
                    _caller: random,
                    _amount: amountToLockUp
                });

                // Check the balance of beneficiary1
                (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal(amountToLockUp);
            });

            it('Can re-lock up tokens after a withdrawal', async () => {
                await lockupTokens(
                    beneficiary1,
                    amountToLockUp,
                    new BN('0')
                );

                await this.timeLockTokenEscrow.withdrawal(1, beneficiary1, {from: random});

                await lockupTokens(
                    beneficiary1,
                    amountToLockUp,
                    new BN('0')
                );

                (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal(amountToLockUp);
            });
        });

        describe('requires', async () => {
            it('Fails when no tokens are locked up for an address', async () => {
                await expectRevert(
                    this.timeLockTokenEscrow.withdrawal(1, random, {from: random}),
                    'There are no tokens locked up for this address'
                );
            });

            it('Fails when tokens have already been claimed', async () => {
                await lockupTokens(
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

            it('Fails when tokens are still within their lockup period', async () => {
                const fiveHoursFromNow = new BN(((await time.latest()) + ((60 * 60) * 5)).toString());
                await lockupTokens(
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

    describe('allows for multiple deposits and withdrawals for a single address', async () => {

        beforeEach(async () => {
            // Ensure timeLockTokenEscrow has no tokens
            (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal('0');

            // first lockup
            await lockupTokens(
                beneficiary1,
                amountToLockUp,
                this.oneHourFromNow
            );

            // second lockup
            await lockupTokens(
                beneficiary1,
                secondAmountToLockUp,
                this.twoHourFromNow
            );

            // Ensure timeLockTokenEscrow now has both tokens
            (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal(
                new BN(amountToLockUp).add(new BN(secondAmountToLockUp))
            );
        });

        it('can enumerate deposits for an address', async () => {
            const depositIds = await this.timeLockTokenEscrow.getDepositIdsForBeneficiary(beneficiary1);
            depositIds.map(e => e.toString()).should.be.deep.equal(['1', '2']);

            await validDeposit(depositIds[0], beneficiary1, {
                creator: creator,
                amount: amountToLockUp,
                lockedUntil: this.oneHourFromNow
            });

            await validDeposit(depositIds[1], beneficiary1, {
                creator: creator,
                amount: secondAmountToLockUp,
                lockedUntil: this.twoHourFromNow
            });
        });

        it('withdrawing the first deposit', async () => {
            // Fast forward to post the time lock
            await time.increaseTo(this.oneHourFromNow);

            const receipt = await this.timeLockTokenEscrow.withdrawal('1', beneficiary1, {from: random});
            await expectEvent(receipt, 'Withdrawal', {
                _depositId: '1',
                _beneficiary: beneficiary1,
                _caller: random,
                _amount: amountToLockUp
            });

            // Check the balance of beneficiary1
            (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal(amountToLockUp);

            // Unable to withdraw from first again
            await expectRevert(
                this.timeLockTokenEscrow.withdrawal('1', beneficiary1),
                'There are no tokens locked up for this address'
            );

            // Unable to withdraw from second yet
            await expectRevert(
                this.timeLockTokenEscrow.withdrawal('2', beneficiary1),
                'Tokens are still locked up'
            );
        });

        it('withdrawing the second deposit', async () => {
            // Fast forward to post the time lock
            await time.increaseTo(this.twoHourFromNow);

            // Can withdraw from first
            const receipt = await this.timeLockTokenEscrow.withdrawal('1', beneficiary1, {from: random});
            await expectEvent(receipt, 'Withdrawal', {
                _depositId: '1',
                _beneficiary: beneficiary1,
                _caller: random,
                _amount: amountToLockUp
            });

            // Can withdraw from second
            const secondWithdrawalReceipt = await this.timeLockTokenEscrow.withdrawal('2', beneficiary1, {from: random});
            await expectEvent(secondWithdrawalReceipt, 'Withdrawal', {
                _depositId: '2',
                _beneficiary: beneficiary1,
                _caller: random,
                _amount: secondAmountToLockUp
            });

            // Check the balance of beneficiary1
            (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal(
                new BN(amountToLockUp).add(new BN(secondAmountToLockUp))
            );

            // Unable to withdraw from first again
            await expectRevert(
                this.timeLockTokenEscrow.withdrawal('1', beneficiary1),
                'There are no tokens locked up for this address'
            );

            // Unable to withdraw from second again
            await expectRevert(
                this.timeLockTokenEscrow.withdrawal('2', beneficiary1),
                'There are no tokens locked up for this address'
            );
        });
    });

    describe('allows for multiple deposits and withdrawals from multiple accounts', async () => {

        beforeEach(async () => {
            // Ensure timeLockTokenEscrow has no tokens
            (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal('0');

            // first lockup - beneficiary1
            await lockupTokens(
                beneficiary1,
                amountToLockUp,
                this.thirtyMinsFromNow
            );

            // second lockup - beneficiary2
            await lockupTokens(
                beneficiary2,
                amountToLockUp,
                this.oneHourFromNow
            );

            // third lockup - beneficiary1
            await lockupTokens(
                beneficiary1,
                amountToLockUp,
                this.twoHourFromNow
            );

            // fourth lockup - beneficiary2
            await lockupTokens(
                beneficiary2,
                amountToLockUp,
                this.twoHourFromNow
            );

            // Ensure timeLockTokenEscrow now has all 4 deposits
            (await this.token.balanceOf(this.timeLockTokenEscrow.address)).should.be.bignumber.equal(
                new BN(amountToLockUp).mul(new BN('4'))
            );
        });

        it('can enumerate deposits for an beneficiary1', async () => {
            const depositIds = await this.timeLockTokenEscrow.getDepositIdsForBeneficiary(beneficiary1);
            depositIds.map(e => e.toString()).should.be.deep.equal(['1', '3']);

            await validDeposit(depositIds[0], beneficiary1, {
                creator: creator,
                amount: amountToLockUp,
                lockedUntil: this.thirtyMinsFromNow
            });

            await validDeposit(depositIds[1], beneficiary1, {
                creator: creator,
                amount: amountToLockUp,
                lockedUntil: this.twoHourFromNow
            });
        });

        it('can enumerate deposits for an beneficiary2', async () => {
            const depositIds = await this.timeLockTokenEscrow.getDepositIdsForBeneficiary(beneficiary2);
            depositIds.map(e => e.toString()).should.be.deep.equal(['2', '4']);

            await validDeposit(depositIds[0], beneficiary2, {
                creator: creator,
                amount: amountToLockUp,
                lockedUntil: this.oneHourFromNow
            });

            await validDeposit(depositIds[1], beneficiary2, {
                creator: creator,
                amount: amountToLockUp,
                lockedUntil: this.twoHourFromNow
            });
        });

        it('withdrawing each deposit', async () => {

            ////////////////
            // Drawdown 1 //
            ////////////////

            await time.increaseTo(this.thirtyMinsFromNow);

            const drawdownOne = await this.timeLockTokenEscrow.withdrawal('1', beneficiary1, {from: random});
            await expectEvent(drawdownOne, 'Withdrawal', {
                _depositId: '1',
                _beneficiary: beneficiary1,
                _caller: random,
                _amount: amountToLockUp
            });

            (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal(amountToLockUp);

            ////////////////
            // Drawdown 2 //
            ////////////////

            await time.increaseTo(this.oneHourFromNow);

            const drawdownTwo = await this.timeLockTokenEscrow.withdrawal('2', beneficiary2, {from: random});
            await expectEvent(drawdownTwo, 'Withdrawal', {
                _depositId: '2',
                _beneficiary: beneficiary2,
                _caller: random,
                _amount: amountToLockUp
            });

            (await this.token.balanceOf(beneficiary2)).should.be.bignumber.equal(amountToLockUp);

            ////////////////
            // Drawdown 3 //
            ////////////////

            await time.increaseTo(this.twoHourFromNow);

            const drawdownThird = await this.timeLockTokenEscrow.withdrawal('3', beneficiary1, {from: random});
            await expectEvent(drawdownThird, 'Withdrawal', {
                _depositId: '3',
                _beneficiary: beneficiary1,
                _caller: random,
                _amount: amountToLockUp
            });

            (await this.token.balanceOf(beneficiary1)).should.be.bignumber.equal(
                new BN(amountToLockUp).mul(new BN('2'))
            );

            ////////////////
            // Drawdown 4 //
            ////////////////

            const drawdownFour = await this.timeLockTokenEscrow.withdrawal('4', beneficiary2, {from: random});
            await expectEvent(drawdownFour, 'Withdrawal', {
                _depositId: '4',
                _beneficiary: beneficiary2,
                _caller: random,
                _amount: amountToLockUp
            });

            (await this.token.balanceOf(beneficiary2)).should.be.bignumber.equal(
                new BN(amountToLockUp).mul(new BN('2'))
            );

            // Unable to withdraw for beneficiary1
            await expectRevert(
                this.timeLockTokenEscrow.withdrawal('1', beneficiary1),
                'There are no tokens locked up for this address'
            );

            // Unable to withdraw for beneficiary2
            await expectRevert(
                this.timeLockTokenEscrow.withdrawal('2', beneficiary1),
                'There are no tokens locked up for this address'
            );
        });

    });
});
