const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log(`Deploying SafeRouteRegistry with ${deployer.address} to chain ${network.chainId}...`);

  const Factory = await ethers.getContractFactory("SafeRouteRegistry", deployer);
  const registry = await Factory.deploy();
  const deploymentTx = registry.deploymentTransaction();
  if (!deploymentTx) throw new Error("Deployment transaction unavailable");
  const receipt = await deploymentTx.wait();
  const address = await registry.getAddress();
  const deployment = {
    address,
    chainId: network.chainId.toString(),
    deployBlock: receipt.blockNumber,
  };

  const outputPath = path.resolve(__dirname, "../../backend/deployment.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`, "utf8");
  console.log(`SafeRouteRegistry deployed at ${address}`);
  console.log(`Chain ID: ${network.chainId}; deploy block: ${receipt.blockNumber}`);
  console.log(`Deployment descriptor: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
