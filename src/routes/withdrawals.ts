import { Router } from "express";
import { prisma } from "../db.js";
import { requireApiKey } from "../middleware/auth.js";

export const withdrawalsRouter = Router({ mergeParams: true });

withdrawalsRouter.use(requireApiKey);

withdrawalsRouter.get("/", async (req, res) => {
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet.trim() : "";
  if (!wallet) {
    res.status(400).json({ error: "Query parameter 'wallet' (address) is required" });
    return;
  }
  const list = await prisma.withdrawal.findMany({
    where: { wallet: wallet.toLowerCase() },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    withdrawals: list.map((w) => ({
      id: w.id,
      wallet: w.wallet,
      token: w.token,
      amount_raw: w.amountRaw,
      tx_hash: w.txHash,
      created_at: w.createdAt,
    })),
  });
});
