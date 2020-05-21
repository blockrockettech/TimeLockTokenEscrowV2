<template>
  <div class="container mt-4">

    <div class="row mt-2">
      <div class="col">

        <div class="card mx-auto">
          <div class="card-header">
            <h5>Unclaimed token locks for {{this.$route.params.address}}</h5>
          </div>
          <div class="card-body">
            <div class="row mt-4 mb-4" v-for="deposit in deposits">
              <div class="col float-right">
                {{deposit.amount}} <span class="badge badge-light">XTP</span>
              </div>
              <div class="col">
                {{deposit.lockedUntil}}
              </div>
              <div class="col">
                <button class="btn btn-outline-primary"
                        @click="withdrawal(deposit.id)"
                        :disabled="withdrawing"
                        v-if="canWithdraw(deposit)">
                  Withdraw
                </button>
                <span class="text-muted" v-else>
                    Not available
                  </span>
              </div>
            </div>
          </div>

          <div class="card-body" v-if="deposits.length === 0 && !loadingLocks">
            <div class="row mb-4">
              <div class="col">
                No locks found
              </div>
            </div>
          </div>

          <div class="card-footer text-right" v-if="deposits.length > 0">
            Total unclaimed: {{totalLocks}}
          </div>
        </div>
      </div>
    </div>

    <div class="row mt-4">
      <div class="col">

        <div class="card mx-auto">
          <div class="card-header">
            <h5>Withdrawal history for {{this.$route.params.address}}</h5>
          </div>

          <div class="card-body">
            <div class="row mt-4 mb-4" v-for="withdrawal in withdrawals">
              <div class="col float-right">
                {{withdrawal.amount}} <span class="badge badge-light">XTP</span>
              </div>
              <div class="col">
                {{withdrawal.timestamp}}
              </div>
              <div class="col">
                <a :href="etherscanLink(withdrawal.transactionHash)" target="_blank">View Transaction</a>
              </div>
            </div>
          </div>

          <div class="card-body" v-if="withdrawals.length === 0 && !loadingHistory">
            <div class="row mb-4">
              <div class="col">
                No history found
              </div>
            </div>
          </div>

          <div class="card-footer text-right">
            Total claimed: {{totalClaimed}}
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
  import _ from 'lodash';
  import {ethers} from 'ethers';
  import utils from '../utils';
  import TimeLockTokenEscrow from '../truffleconf/TimeLockTokenEscrow.json';
  import TestToken from '../truffleconf/TestToken.json';

  export default {
    name: 'AccountLocks',
    data() {
      return {
        form: {
          beneficiary: '',
        },
        loadingLocks: false,
        loadingHistory: false,
        withdrawing: false,
        deposits: [],
        withdrawals: [],
        web3: {
          provider: null,
          signer: null,
          chain: null,
          escrowContract: null,
          genericERC20TokenContract: null
        },
      };
    },
    computed: {
      totalLocks() {
        const totalBN = _.reduce(_.map(this.deposits, 'amountBN'), (sum, n) => {
          return sum.add(n);
        }, ethers.constants.Zero);
        return ethers.utils.formatUnits(totalBN, '18');
      },
      totalClaimed() {
        return _.reduce(_.map(this.withdrawals, 'amount'), (sum, n) => {
          return _.toNumber(sum) + _.toNumber(n);
        }, 0);
      }
    },
    methods: {
      async withdrawal(depositId) {
        try {
          this.withdrawing = true;
          const withdrawalTx = await this.web3.escrowContract.withdrawal(depositId, this.$route.params.address, {
            gasLimit: 250000
          });
          await withdrawalTx.wait(1);
          this.withdrawing = false;
          await this.loadAccountLocks();
          await this.loadAccountHistory();
        } catch (e) {
          this.withdrawing = false;
        }
      },
      canWithdraw(deposit) {
        if (_.toLower(this.web3.loggedInAddress) !== _.toLower(this.$route.params.address)) {
          return false;
        }
        return deposit.lockedUntil.isBefore(new Date());
      },
      etherscanLink(transactionHash) {
        return `${utils.lookupEtherscanAddress(this.web3.chain.chainId)}/tx/${transactionHash}`;
      },
      async loadAccountLocks() {
        this.loadingLocks = true;
        const depositIds = await this.web3.escrowContract.getDepositIdsForBeneficiary(this.$route.params.address);
        const deposits = await Promise.all(depositIds.map(async (depositId) => {
          const {_amount, _creator, _lockedUntil} = await this.web3.escrowContract.getLockForDepositIdAndBeneficiary(depositId, this.$route.params.address);
          return {
            id: depositId,
            _creator: _creator,
            amountBN: _amount,
            amount: ethers.utils.formatUnits(_amount, '18'),
            lockedUntil: this.$moment.unix(_lockedUntil.toString()),
          };
        }));
        this.deposits = _.filter(_.sortBy(deposits, 'lockedUntil'), (val) => val.amount > 0);
        this.loadingLocks = false;
      },
      async loadAccountHistory() {
        this.loadingHistory = true;
        const filter = this.web3.escrowContract.filters.Withdrawal(null, this.$route.params.address, null, null);
        filter.fromBlock = 0;
        filter.toBlock = 'latest';

        const parser = new ethers.utils.Interface(TimeLockTokenEscrow.abi);
        const events = await this.web3.provider.getLogs(filter);

        const rawHistory = await Promise.all(_.map(events, async (event) => {
          const {transactionHash, blockNumber} = event;
          const {values} = parser.parseLog(event);
          const {_amount, _beneficiary, _caller, _depositId} = values;
          const {timestamp} = await this.web3.provider.getBlock(blockNumber);
          return {
            amount: ethers.utils.formatUnits(_amount, '18'),
            depositId: ethers.utils.formatUnits(_depositId, '18'),
            beneficiary: _beneficiary,
            caller: _caller,
            timestamp: this.$moment.unix(timestamp),
            transactionHash,
            blockNumber,
          };
        }));

        this.withdrawals = _.sortBy(rawHistory, 'timestamp');
        this.loadingHistory = false;
      }
    },
    async created() {
      await window.ethereum.enable();
      this.web3.provider = new ethers.providers.Web3Provider(web3.currentProvider);
      this.web3.signer = this.web3.provider.getSigner();
      this.web3.loggedInAddress = await this.web3.provider.getSigner().getAddress();
      this.web3.chain = await this.web3.provider.getNetwork();

      const escrowContractAddress = utils.getContractAddressFromTruffleConf(TimeLockTokenEscrow, this.web3.chain.chainId);
      this.web3.escrowContract = new ethers.Contract(
        escrowContractAddress,
        TimeLockTokenEscrow.abi,
        this.web3.signer,
      );

      const tokenAddress = await this.web3.escrowContract.token();
      this.web3.genericERC20TokenContract = new ethers.Contract(
        tokenAddress,
        TestToken.abi,
        this.web3.signer
      );

      this.loadAccountLocks();
      this.loadAccountHistory();
    },
  };
</script>

<style>
</style>
