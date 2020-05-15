pragma solidity ^0.6.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {

    uint8 public constant DECIMALS = 18;
    uint256 public constant INITIAL_SUPPLY = 1000000 * (10 ** uint256(DECIMALS)); // 1 million

    constructor() public ERC20("Token", "TOK") {
        // Mint 1 million tokens to creator
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    function burn(uint256 value) public {
        super._burn(msg.sender, value);
    }

    function mint(uint256 value) public {
        super._mint(msg.sender, value);
    }
}
