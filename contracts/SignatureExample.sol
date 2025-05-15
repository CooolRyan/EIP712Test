// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SignatureExample is EIP712, Ownable {
    // 위임 관계 구조체
    struct Delegation {
        address agent;      // 대행기관 주소
        bool isValid;       // 위임 유효 여부
        uint256 validUntil; // 위임 만료 시간
        string scope;       // 위임 범위 (예: "VOICE_VERIFICATION")
    }

    // EIP712 도메인 구분자를 위한 타입해시
    bytes32 public constant DELEGATE_TYPEHASH = keccak256(
        "DelegateVoice(address principal,address agent,string voiceId,string scope,uint256 validUntil,uint256 nonce,uint256 timestamp)"
    );

    // 대행기관(agent)별 위임 받은 사용자(principal) 매핑
    mapping(address => mapping(address => Delegation)) public delegations;
    
    // 사용자별 nonce 관리
    mapping(address => uint256) public nonces;
    
    // 이미 사용된 voiceId를 추적
    mapping(string => bool) public usedVoiceIds;
    
    // 타임스탬프 유효 기간 (예: 5분)
    uint256 public constant TIMESTAMP_VALIDITY = 5 minutes;

    constructor() EIP712("DelegateVoice", "1.0") {}

    // 위임 등록 이벤트
    event DelegationRegistered(
        address indexed principal,
        address indexed agent,
        string scope,
        uint256 validUntil,
        uint256 timestamp
    );

    // 위임 취소 이벤트
    event DelegationRevoked(
        address indexed principal,
        address indexed agent,
        uint256 timestamp
    );

    // 음성 인증 완료 이벤트
    event VoiceVerified(
        address indexed principal,
        address indexed agent,
        string voiceId,
        string scope,
        uint256 timestamp
    );

    // 위임 등록 (principal이 직접 호출)
    function registerDelegation(
        address agent,
        string memory scope,
        uint256 validUntil
    ) external {
        require(agent != address(0), "Invalid agent address");
        require(!delegations[msg.sender][agent].isValid, "Delegation already exists");
        require(validUntil > block.timestamp, "Invalid expiration time");

        delegations[msg.sender][agent] = Delegation({
            agent: agent,
            isValid: true,
            validUntil: validUntil,
            scope: scope
        });

        emit DelegationRegistered(msg.sender, agent, scope, validUntil, block.timestamp);
    }

    // 위임 취소 (principal이 직접 호출)
    function revokeDelegation(address agent) external {
        require(delegations[msg.sender][agent].isValid, "Delegation does not exist");
        
        delegations[msg.sender][agent].isValid = false;
        
        emit DelegationRevoked(msg.sender, agent, block.timestamp);
    }

    // 대행기관이 사용자를 대신하여 음성 인증 수행
    function verifyVoiceWithDelegation(
        address principal,
        string memory voiceId,
        string memory scope,
        uint256 validUntil,
        uint256 timestamp,
        bytes memory signature
    ) public returns (bool) {
        Delegation memory delegation = delegations[principal][msg.sender];
        require(delegation.isValid, "Not delegated");
        require(block.timestamp <= delegation.validUntil, "Delegation expired");
        require(block.timestamp <= timestamp + TIMESTAMP_VALIDITY, "Verification request expired");
        require(!usedVoiceIds[voiceId], "Voice ID already used");
        require(keccak256(bytes(delegation.scope)) == keccak256(bytes(scope)), "Invalid scope");

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    DELEGATE_TYPEHASH,
                    principal,
                    msg.sender,
                    keccak256(bytes(voiceId)),
                    keccak256(bytes(scope)),
                    validUntil,
                    nonces[principal]++,
                    timestamp
                )
            )
        );
        
        // principal의 서명 검증
        address signer = ECDSA.recover(digest, signature);
        require(signer == principal, "Invalid signature");

        // voiceId 사용 처리
        usedVoiceIds[voiceId] = true;
        
        emit VoiceVerified(principal, msg.sender, voiceId, scope, block.timestamp);
        
        return true;
    }

    // principal의 현재 nonce 조회
    function getNonce(address principal) external view returns (uint256) {
        return nonces[principal];
    }

    // 위임 상태 조회
    function getDelegation(address principal, address agent) 
        external 
        view 
        returns (
            bool isValid,
            uint256 validUntil,
            string memory scope
        ) 
    {
        Delegation memory delegation = delegations[principal][agent];
        return (delegation.isValid, delegation.validUntil, delegation.scope);
    }
} 