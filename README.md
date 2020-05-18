TimeLockTokenEscrowV2
=========

![](https://github.com/blockrockettech/TimeLockTokenEscrowV2/workflows/Test%20Smart%20Contracts/badge.svg)


#### Running against slither

* Install [slither](https://github.com/crytic/slither)
```
$ docker pull trailofbits/eth-security-toolbox
```

* Share the contracts directory in the container
```
$ docker run -it -v /{path-to-project}/smart-contracts:/share  trailofbits/eth-security-toolbox
```

* Flatten contracts
```
$ ./truffle_flatten.sh
```

* Test it works
```
$ slither /share/flat/TimeLockTokenEscrow.sol  --print human-summary
```

- Various other forms of printer can be found here https://github.com/crytic/slither/wiki/Printer-documentation

* Run some simple tests
```
$ slither /share/flat/TimeLockTokenEscrow.sol
```

### Running Echidna (fuzzy testing) - WIP

```
$ cd /share/
$ echidna-test . --contract TimeLockTokenEscrow --config echidna_config.yaml
```
