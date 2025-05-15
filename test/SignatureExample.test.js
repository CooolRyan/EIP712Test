const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SignatureExample", function () {
    let signatureExample;
    let owner;
    let principal;
    let agent;

    // EIP-712 도메인 타입 정의
    const domain = {
        name: "DelegateVoice",
        version: "1.0",
        chainId: 31337, // Hardhat 기본 chainId
    };

    // 메시지 타입 정의
    const types = {
        DelegateVoice: [
            { name: "principal", type: "address" },
            { name: "agent", type: "address" },
            { name: "voiceId", type: "string" },
            { name: "nonce", type: "uint256" },
            { name: "timestamp", type: "uint256" }
        ]
    };

    beforeEach(async function () {
        [owner, principal, agent] = await ethers.getSigners();
        
        const SignatureExample = await ethers.getContractFactory("SignatureExample");
        signatureExample = await SignatureExample.deploy();
        await signatureExample.deployed();
        
        // verifyingContract 주소 추가
        domain.verifyingContract = signatureExample.address;

        // 위임 등록
        await signatureExample.connect(principal).registerDelegation(agent.address);
    });

    it("should register and verify delegation", async function () {
        // 위임 상태 확인
        const [isValid, timestamp] = await signatureExample.getDelegation(principal.address, agent.address);
        expect(isValid).to.be.true;
        expect(timestamp).to.be.gt(0);
    });

    it("should verify voice with delegation", async function () {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const nonce = await signatureExample.getNonce(principal.address);
        
        // 검증할 메시지 데이터
        const message = {
            principal: principal.address,
            agent: agent.address,
            voiceId: "voice123",
            nonce: nonce,
            timestamp: currentTimestamp
        };

        // principal이 서명
        const signature = await principal._signTypedData(
            domain,
            types,
            message
        );

        // agent가 검증 함수 호출
        const isValid = await signatureExample.connect(agent).verifyVoiceWithDelegation(
            message.principal,
            message.voiceId,
            message.timestamp,
            signature
        );

        expect(isValid).to.be.true;

        // nonce가 증가했는지 확인
        const newNonce = await signatureExample.getNonce(principal.address);
        expect(newNonce).to.equal(nonce.add(1));

        // 같은 voiceId로 다시 검증 시도하면 실패해야 함
        await expect(
            signatureExample.connect(agent).verifyVoiceWithDelegation(
                message.principal,
                message.voiceId,
                message.timestamp,
                signature
            )
        ).to.be.revertedWith("Voice ID already used");
    });

    it("should fail verification without delegation", async function () {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const nonce = await signatureExample.getNonce(principal.address);
        
        // 위임 취소
        await signatureExample.connect(principal).revokeDelegation(agent.address);

        const message = {
            principal: principal.address,
            agent: agent.address,
            voiceId: "voice456",
            nonce: nonce,
            timestamp: currentTimestamp
        };

        const signature = await principal._signTypedData(
            domain,
            types,
            message
        );

        // 위임이 취소되었으므로 검증 실패해야 함
        await expect(
            signatureExample.connect(agent).verifyVoiceWithDelegation(
                message.principal,
                message.voiceId,
                message.timestamp,
                signature
            )
        ).to.be.revertedWith("Not delegated");
    });

    it("should fail with expired timestamp", async function () {
        const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1시간 전
        const nonce = await signatureExample.getNonce(principal.address);
        
        const message = {
            principal: principal.address,
            agent: agent.address,
            voiceId: "voice789",
            nonce: nonce,
            timestamp: expiredTimestamp
        };

        const signature = await principal._signTypedData(
            domain,
            types,
            message
        );

        await expect(
            signatureExample.connect(agent).verifyVoiceWithDelegation(
                message.principal,
                message.voiceId,
                message.timestamp,
                signature
            )
        ).to.be.revertedWith("Verification request expired");
    });
}); 