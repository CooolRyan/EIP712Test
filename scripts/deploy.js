const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);

  const SignatureExample = await ethers.getContractFactory("SignatureExample");
  const signatureExample = await SignatureExample.deploy();
  await signatureExample.deployed();

  console.log("SignatureExample deployed to:", signatureExample.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 