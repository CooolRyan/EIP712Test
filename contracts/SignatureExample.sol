// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract SignatureExample is EIP712 {
    // EIP712 도메인 구분자를 위한 타입해시
    bytes32 public constant MAIL_TYPEHASH = keccak256("Mail(address to,string contents)");

    constructor() EIP712("SignatureExample", "1.0") {}

    function verify(
        address to,
        string memory contents,
        bytes memory signature
    ) public view returns (bool) {
        // 구조화된 데이터의 해시 생성
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    MAIL_TYPEHASH,
                    to,
                    keccak256(bytes(contents))
                )
            )
        );
        
        // 서명으로부터 서명자 주소 복구
        address signer = ECDSA.recover(digest, signature);
        
        // 서명자가 msg.sender인지 확인
        return signer == msg.sender;
    }
} 