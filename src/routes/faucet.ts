import { Router } from "express";
import { JsonRpcProvider, Contract } from "ethers";
import { config } from "../config.js";

export const faucetRouter = Router({ mergeParams: true });

// Simple ABI for Faucet contract
const FAUCET_ABI = [
  "function canClaim(address user) view returns (bool canClaim, uint256 timeUntilClaim)",
  "function claimAmount() view returns (uint256)",
  "function claim()",
] as const;

/**
 * GET /api/faucet/status/:address
 * Get faucet claim status for a user address
 */
faucetRouter.get("/status/:address", async (req, res) => {
  try {
    const faucetAddress = process.env.FAUCET_ADDRESS;
    if (!faucetAddress) {
      res.status(503).json({ error: "Faucet not configured" });
      return;
    }

    const userAddress = req.params.address;
    if (!userAddress || !userAddress.startsWith("0x")) {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const provider = new JsonRpcProvider(config.etherlinkRpcUrl);
    const faucet = new Contract(faucetAddress, FAUCET_ABI, provider);

    const [canClaim, timeUntilClaim] = await faucet.canClaim(userAddress);
    const claimAmount = await faucet.claimAmount();

    res.json({
      canClaim,
      timeUntilClaim: Number(timeUntilClaim),
      claimAmount: claimAmount.toString(),
      faucetAddress,
    });
  } catch (e) {
    console.error("Faucet status error:", e);
    res.status(500).json({ error: "Failed to get faucet status" });
  }
});

/**
 * GET /api/faucet/info
 * Get general faucet information
 */
faucetRouter.get("/info", async (req, res) => {
  try {
    const faucetAddress = process.env.FAUCET_ADDRESS;
    const tokenAddress = process.env.TEST_USDC_ADDRESS;

    if (!faucetAddress || !tokenAddress) {
      res.status(503).json({ error: "Faucet not configured" });
      return;
    }

    const provider = new JsonRpcProvider(config.etherlinkRpcUrl);
    const faucet = new Contract(faucetAddress, FAUCET_ABI, provider);

    const claimAmount = await faucet.claimAmount();

    res.json({
      faucetAddress,
      tokenAddress,
      claimAmount: claimAmount.toString(),
      cooldownHours: 24,
    });
  } catch (e) {
    console.error("Faucet info error:", e);
    res.status(500).json({ error: "Failed to get faucet info" });
  }
});
