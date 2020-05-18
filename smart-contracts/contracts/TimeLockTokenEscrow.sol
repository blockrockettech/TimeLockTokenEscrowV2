pragma solidity ^0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TimeLockTokenEscrow is ReentrancyGuard {

    event Lockup(
        uint256 indexed _depositId,
        address indexed _creator,
        address indexed _beneficiary,
        uint256 _amount,
        uint256 _lockedUntil
    );

    event Withdrawal(
        uint256 indexed _depositId,
        address indexed _beneficiary,
        address indexed _caller,
        uint256 _amount
    );

    struct TimeLock {
        address creator;
        uint256 amount;
        uint256 lockedUntil;
    }

    IERC20 public token;

    // Deposit ID -> beneficiary -> TimeLock data mappings
    mapping(uint256 => mapping(address => TimeLock)) public beneficiaryToTimeLock;

    // Reverse lookup for beneficiary to deposits
    mapping(address => uint256[]) beneficiaryToDepositIds;

    // An incrementing ID counter for each new deposit
    uint256 public depositIdPointer = 0;

    constructor(IERC20 _token) public {
        token = _token;
    }

    /**
     * @dev Locks the the given amount of tokens to the beneficiary for the given amount of time
     * @param _beneficiary address the beneficiary
     * @param _amount uint256 the amount to lockup
     * @param _lockedUntil uint256 the time when the timelock expires
    */
    function lock(address _beneficiary, uint256 _amount, uint256 _lockedUntil) external nonReentrant {
        require(_beneficiary != address(0), "You cannot lock up tokens for the zero address");
        require(_amount > 0, "Lock up amount of zero tokens is invalid");
        require(token.allowance(msg.sender, address(this)) >= _amount, "The contract does not have enough of an allowance to escrow");

        // generate next deposit ID to use for the address
        depositIdPointer = depositIdPointer + 1;

        // Add reverse mapping for query help
        beneficiaryToDepositIds[_beneficiary].push(depositIdPointer);

        beneficiaryToTimeLock[depositIdPointer][_beneficiary] = TimeLock({
            creator : msg.sender,
            amount : _amount,
            lockedUntil : _lockedUntil
            });

        emit Lockup(depositIdPointer, msg.sender, _beneficiary, _amount, _lockedUntil);

        bool transferSuccess = token.transferFrom(msg.sender, address(this), _amount);
        require(transferSuccess, "Failed to escrow tokens into the contract");
    }

    /**
     * @dev Withdraw the locked up amount for the given deposit and beneficiary
     * @param _depositId uint256 the deposit ID
     * @param _beneficiary address the beneficiary
     */
    function withdrawal(uint256 _depositId, address _beneficiary) external nonReentrant {
        TimeLock storage lockup = beneficiaryToTimeLock[_depositId][_beneficiary];
        require(lockup.amount > 0, "There are no tokens locked up for this address");
        require(now >= lockup.lockedUntil, "Tokens are still locked up");

        uint256 transferAmount = lockup.amount;
        lockup.amount = 0;

        emit Withdrawal(_depositId, _beneficiary, msg.sender, transferAmount);

        bool transferSuccess = token.transfer(_beneficiary, transferAmount);
        require(transferSuccess, "Failed to send tokens to the beneficiary");
    }

    /**
     * @dev Used to enumerate a beneficiaries deposits
     * @param _beneficiary address the beneficiary to find any deposit IDs for
     * @return depositIds uint256[] of deposit IDs for the given beneficiary
    */
    function getDepositIdsForBeneficiary(address _beneficiary) external view returns (uint256[] memory depositIds) {
        return beneficiaryToDepositIds[_beneficiary];
    }

    /**
     * @dev Used to get the time lock config for the deposit ID and beneficiary
     * @param _depositId uint256 the deposit to look up
     * @param _beneficiary address the beneficiary which matches the deposit ID
     * @return _creator address the creator of the time lock
     * @return _amount uint256 the amount of tokens locked
     * @return _lockedUntil uint256 for when the timelock expires
    */
    function getLockForDepositIdAndBeneficiary(uint256 _depositId, address _beneficiary)
    external view returns (address _creator, uint256 _amount, uint256 _lockedUntil) {
        TimeLock storage lockup = beneficiaryToTimeLock[_depositId][_beneficiary];
        return (
        lockup.creator,
        lockup.amount,
        lockup.lockedUntil
        );
    }

}
