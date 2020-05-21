function getContractAddressFromTruffleConf(truffleConf, chainId) {
  if (!truffleConf || !chainId) return '';
  const {networks} = truffleConf;
  if (networks[chainId.toString()]) {
    const address = networks[chainId.toString()].address;
    return address ? address : '';
  }
  return '';
}

function lookupEtherscanAddress(id) {
  switch (id) {
    case 1:
      return 'https://etherscan.io';
    case 3:
      return 'https://ropsten.etherscan.io';
    case 4:
      return 'https://rinkeby.etherscan.io';
    case 42:
      return 'https://kovan.etherscan.io';
    default:
      return '';
  }
}

export default {
  getContractAddressFromTruffleConf,
  lookupEtherscanAddress
};
