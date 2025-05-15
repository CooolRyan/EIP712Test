const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 환경 변수 검증
const {
    RPC_URL,
    CHAIN_ID,
    CONTRACT_ADDRESS,
    AGENT_PRIVATE_KEY
} = process.env;

if (!RPC_URL || !CHAIN_ID || !CONTRACT_ADDRESS || !AGENT_PRIVATE_KEY) {
    throw new Error('필수 환경 변수가 설정되지 않았습니다.');
}

// 컨트랙트 아티팩트 로드
const SignatureExample = require('./artifacts/contracts/SignatureExample.sol/SignatureExample.json');

// 이더리움 프로바이더 및 서명자 설정
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const agent = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);

// 컨트랙트 인스턴스 생성
const contract = new ethers.Contract(CONTRACT_ADDRESS, SignatureExample.abi, agent);

// 프라이빗 키 관리 서비스 (실제 구현에서는 HSM이나 KMS 사용 권장)
class KeyManagementService {
    constructor() {
        this.wallets = new Map();
    }

    async loadPrivateKey(userId) {
        // 실제 구현에서는 HSM이나 KMS에서 안전하게 키를 로드
        return this.wallets.get(userId);
    }

    async storePrivateKey(userId, privateKey) {
        // 실제 구현에서는 HSM이나 KMS에 안전하게 키를 저장
        this.wallets.set(userId, privateKey);
    }
}

const keyManager = new KeyManagementService();

// EIP-712 도메인
const domain = {
    name: "DelegateVoice",
    version: "1.0",
    chainId: parseInt(CHAIN_ID),
    verifyingContract: CONTRACT_ADDRESS
};

// 타입 정의
const types = {
    DelegateVoice: [
        { name: "principal", type: "address" },
        { name: "agent", type: "address" },
        { name: "voiceId", type: "string" },
        { name: "scope", type: "string" },
        { name: "validUntil", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "timestamp", type: "uint256" }
    ]
};

// 새로운 사용자 지갑 생성 API
app.post('/api/wallet/create', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
        }

        // 이미 존재하는 지갑 확인
        const existingKey = await keyManager.loadPrivateKey(userId);
        if (existingKey) {
            return res.status(400).json({ error: '이미 지갑이 존재합니다.' });
        }

        // 새 지갑 생성
        const wallet = ethers.Wallet.createRandom();
        await keyManager.storePrivateKey(userId, wallet.privateKey);

        // 위임 등록 (30일 유효)
        const validUntil = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
        const tx = await contract.connect(wallet).registerDelegation(
            agent.address,
            "VOICE_VERIFICATION",
            validUntil
        );
        await tx.wait();

        return res.json({
            address: wallet.address,
            message: '지갑이 생성되고 위임이 등록되었습니다.',
            delegationTx: tx.hash
        });
    } catch (error) {
        console.error('지갑 생성 오류:', error);
        return res.status(500).json({ error: '지갑 생성 중 오류가 발생했습니다.' });
    }
});

// 음성 인증 검증 API
app.post('/api/verify/voice', async (req, res) => {
    try {
        const { userId, voiceId } = req.body;
        if (!userId || !voiceId) {
            return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
        }

        // 사용자 지갑 확인
        const principalPrivateKey = await keyManager.loadPrivateKey(userId);
        if (!principalPrivateKey) {
            return res.status(404).json({ error: '사용자 지갑을 찾을 수 없습니다.' });
        }

        const principalWallet = new ethers.Wallet(principalPrivateKey, provider);
        const timestamp = Math.floor(Date.now() / 1000);
        const validUntil = timestamp + (30 * 24 * 60 * 60); // 30일
        const scope = "VOICE_VERIFICATION";

        // nonce 조회
        const nonce = await contract.getNonce(principalWallet.address);

        // 서명할 메시지 데이터
        const message = {
            principal: principalWallet.address,
            agent: agent.address,
            voiceId: voiceId,
            scope: scope,
            validUntil: validUntil,
            nonce: nonce.toNumber(),
            timestamp: timestamp
        };

        // EIP-712 서명 생성
        const signature = await principalWallet._signTypedData(
            domain,
            types,
            message
        );

        // 컨트랙트 호출
        const tx = await contract.verifyVoiceWithDelegation(
            message.principal,
            message.voiceId,
            message.scope,
            message.validUntil,
            message.timestamp,
            signature
        );

        // 트랜잭션 완료 대기
        const receipt = await tx.wait();

        // VoiceVerified 이벤트 확인
        const event = receipt.events?.find(e => e.event === 'VoiceVerified');
        
        return res.json({
            success: true,
            transaction: tx.hash,
            event: event ? {
                principal: event.args.principal,
                agent: event.args.agent,
                voiceId: event.args.voiceId,
                scope: event.args.scope,
                timestamp: event.args.timestamp.toString()
            } : null
        });

    } catch (error) {
        console.error('음성 인증 검증 오류:', error);
        return res.status(500).json({ 
            error: '음성 인증 검증 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서명 API 서버가 포트 ${PORT}에서 실행 중입니다.`);
}); 