<template>
  <div class="container mt-4">
    <div class="row mt-5 mb-5">
      <div class="col">
        <div class="card mx-auto min-height-300 max-width-700">
          <div class="card-header">
            <h5>Setup a new time lock escrow</h5>
          </div>
          <div class="card-body">
            <div>
              <label class="fixed-width-label text-right" for="inputBeneficiary">Beneficiary:</label>
              <input type="text"
                     id="inputBeneficiary"
                     class="ml-2 form-control fixed-width-input d-inline-block"
                     placeholder="0x123..."
                     v-model="form.beneficiary"/>
            </div>
            <div class="mt-1">
              <label class="fixed-width-label text-right" for="inputAmount">Amount: </label>
              <input type="text"
                     id="inputAmount"
                     class="ml-2 form-control fixed-width-input d-inline-block"
                     placeholder="500"
                     v-model="form.amount"/>
            </div>
            <div class="mt-1">
              <label class="fixed-width-label text-right">Locked Until: </label>
              <DateTimePicker format="DD-MM-YYYY H:i:s"
                              v-model='form.lockedUntil'
                              firstDayOfWeek="1"
                              class="ml-2 form-control fixed-width-input d-inline-block test"/>
            </div>
          </div>
          <div class="card-footer text-right">
            <b-button variant="primary" class="mt-2" @click="lockupTokens" :disabled="lockingUp">
              <span v-if="!lockingUp">Lockup</span>
              <SmallSpinner v-else/>
            </b-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import {ethers} from 'ethers';
  import utils from '../utils';
  import TimeLockTokenEscrow from '../truffleconf/TimeLockTokenEscrow';
  import TestToken from '../truffleconf/TestToken';

  import SmallSpinner from '../components/SmallSpinner';
  import DateTimePicker from '../components/DateTimePicker';

  export default {
    name: 'admin',
    components: {SmallSpinner, DateTimePicker},
    data() {
      return {
        lockingUp: false,
        form: {
          beneficiary: '',
        },
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
      async lockupTokens() {
        try {
          this.lockingUp = true;

          const escrowContractAddress = utils.getContractAddressFromTruffleConf(TimeLockTokenEscrow, this.web3.chain.chainId);

          const tokenAmount = ethers.utils.parseUnits(this.form.amount, '18');
          const unlockDate = this.$moment(this.form.lockedUntil, 'DD-MM-YYYY HH:mm:ss').unix();

          // Approve
          const approveTx = await this.web3.genericERC20TokenContract.approve(escrowContractAddress, tokenAmount);

          // Lockup
          const lockupTx = await this.web3.escrowContract.lock(this.form.beneficiary, tokenAmount, unlockDate, {gasLimit: 250000});

          // Wait for 1 confirmation for both transactions
          await approveTx.wait(1);
          await lockupTx.wait(1);

          this.lockingUp = false;
        } catch (e) {
          this.lockingUp = false;
        }
      },
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
    },
  };
</script>

<style>
  .fixed-width-label {
    width: 100px;
  }

  .fixed-width-input {
    width: 375px !important;
  }

  input#tj-datetime-input {
    border: 1px solid #ffffff;
  }

  .min-height-300 {
    min-height: 300px;
  }

  .max-width-700 {
    max-width: 700px;
  }
</style>
