const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SignatureExample", function () {
    let signatureExample;
    let owner;
    let addr1;

    // EIP-712 도메인 타입 정의
    const domain = {
        name: "SignatureExample",
        version: "1.0",
        chainId: 31337, // Hardhat 기본 chainId
    };

    // 메시지 타입 정의
    const types = {
        Mail: [
            { name: "to", type: "address" },
            { name: "contents", type: "string" }
        ]
    };

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        
        const SignatureExample = await ethers.getContractFactory("SignatureExample");
        signatureExample = await SignatureExample.deploy();
        await signatureExample.deployed();
        
        // verifyingContract 주소 추가
        domain.verifyingContract = signatureExample.address;
    });

    it("should verify signature from frontend wallet", async function () {
        // 서명할 메시지 데이터
        const message = {
            to: addr1.address,
            contents: "Hello Web3!"
        };

        // 프론트엔드에서 서명하는 것처럼 owner가 서명
        const signature = await owner._signTypedData(
            domain,
            types,
            message
        );

        // 컨트랙트의 verify 함수 호출
        const isValid = await signatureExample.verify(
            message.to,
            message.contents,
            signature
        );

        expect(isValid).to.be.true;
    });
}); 