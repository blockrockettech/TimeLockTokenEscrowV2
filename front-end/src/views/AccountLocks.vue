<template>
  <div class="container mt-4">

    <div class="row mt-2">
      <div class="col">
        <h5>Unclaimed token locks for {{this.$route.params.address}}</h5>
      </div>
    </div>

    <div class="row mt-4" v-for="deposit in deposits">
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
          Not available yet
        </span>
      </div>
    </div>

    <div class="row mt-4" v-if="deposits.length === 0 && !loadingLocks">
      <div class="col">
        <b-alert></b-alert>
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
        withdrawing: false,
        deposits: [],
        web3: {
          provider: null,
          signer: null,
          chain: null,
          escrowContract: null,
          genericERC20TokenContract: null
        },
      };
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
        } catch (e) {
          this.withdrawing = false;
        }
      },
      canWithdraw(deposit) {
        return deposit.lockedUntil.isBefore(new Date());
      },
      async loadAccountLocks() {
        this.loadingLocks = true;

        const depositIds = await this.web3.escrowContract.getDepositIdsForBeneficiary(this.$route.params.address);

        const deposits = await Promise.all(depositIds.map(async (depositId) => {
          const {_amount, _creator, _lockedUntil} = await this.web3.escrowContract.getLockForDepositIdAndBeneficiary(depositId, this.$route.params.address);
          return {
            id: depositId,
            _creator: _creator,
            amount: ethers.utils.formatUnits(_amount, '18'),
            lockedUntil: this.$moment.unix(_lockedUntil.toString()),
          };
        }));
        this.deposits = _.filter(_.sortBy(deposits, 'lockedUntil'), (val) => val.amount > 0);

        this.loadingLocks = false;
      }
    },
    async created() {
      await window.ethereum.enable();
      this.web3.provider = new ethers.providers.Web3Provider(web3.currentProvider);
      this.web3.signer = this.web3.provider.getSigner();
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

    },
  };
</script>

<style>
</style>
