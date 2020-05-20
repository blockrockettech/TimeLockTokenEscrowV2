<template>
  <div class="container mt-4">
    <div class="row mt-5">
      <div class="col">
        <div class="card min-height-300">
          <div class="card-header"><h5>Time Lock Information</h5></div>
          <div class="card-body">
            <div>
              <label class="fixed-width-label text-right"
                     for="inputBeneficiaryLockup">Beneficiary:</label>
              <input type="text"
                     id="inputBeneficiaryLockup"
                     class="ml-2 form-control fixed-width-input d-inline-block"
                     placeholder="0x123..."
                     v-model="form.beneficiaryLockup"/>
            </div>
          </div>
          <div class="card-footer text-right">
            <b-button variant="primary" class="mt-2"
                      @click="$router.push({name: 'accountLocks', params: { address: form.beneficiaryLockup }})">
              Search
            </b-button>
          </div>
        </div>
      </div>
      <div class="col">
        <div class="card min-height-300">
          <div class="card-header">
            <h5>XTP Balance</h5>
          </div>
          <div class="card-body">
            <div>
              <label class="fixed-width-label text-right" for="inputAddress">Address:</label>
              <input type="text"
                     id="inputAddress"
                     class="ml-2 form-control fixed-width-input d-inline-block"
                     placeholder="0x123..."
                     v-model="form.address"/>
            </div>
            <div class="mt-4 text-left alert alert-info" v-if="tokenBalance"><strong>Balance:</strong>
              {{tokenBalance}}
            </div>
          </div>
          <div class="card-footer text-right">
            <b-button variant="primary" class="mt-2" @click="balance">
              <span>Balance</span>
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

  export default {
    name: 'home',
    components: {},
    data() {
      return {
        form: {
          beneficiary: '',
          address: '',
        },
        web3: {
          provider: null,
          signer: null,
          chain: null,
          escrowContract: null,
          genericERC20TokenContract: null
        },
        lockingUp: false,
        withdrawing: false,
        tokenBalance: null,
      };
    },
    methods: {
      async balance() {
        const balanceTx = await this.web3.genericERC20TokenContract.balanceOf(this.form.address);
        this.tokenBalance = ethers.utils.formatUnits(balanceTx, '18');
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

  .min-height-300 {
    min-height: 300px;
  }
</style>
