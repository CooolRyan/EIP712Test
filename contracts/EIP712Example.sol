// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EIP712Example is ERC721, EIP712, Ownable {
    mapping(uint256 => bool) public usedNonces;
    mapping(address => bool) public authorizedSigners;

    struct MintRequest {
        address to;          // 민팅 대상 주소
        uint256 tokenId;     // 발행할 토큰 ID
        uint256 nonce;       // 재사용 방지를 위한 nonce
        uint256 deadline;    // 요청 만료 시간
    }

    constructor() 
        ERC721("MyNFT", "MNFT") 
        EIP712("MyNFT", "1.0.0") 
    {}

    function addSigner(address signer) external onlyOwner {
        authorizedSigners[signer] = true;
    }

    function removeSigner(address signer) external onlyOwner {
        authorizedSigners[signer] = false;
    }

    function _hash(MintRequest calldata request) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            keccak256("MintRequest(address to,uint256 tokenId,uint256 nonce,uint256 deadline)"),
            request.to,
            request.tokenId,
            request.nonce,
            request.deadline
        )));
    }

    function mintWithSignature(
        MintRequest calldata request,
        bytes memory signature
    ) public {
        require(block.timestamp <= request.deadline, "Request expired");
        require(!usedNonces[request.nonce], "Nonce already used");
        
        bytes32 hash = _hash(request);
        address signer = ECDSA.recover(hash, signature);
        
        require(authorizedSigners[signer], "Invalid signer");
        require(request.to == msg.sender, "Not authorized to mint");

        usedNonces[request.nonce] = true;
        _mint(request.to, request.tokenId);
    }
} 