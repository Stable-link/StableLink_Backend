import { Router } from "express";
import { prisma } from "../db.js";
import { requireApiKey } from "../middleware/auth.js";

export const organizationRouter = Router();

organizationRouter.use(requireApiKey);

organizationRouter.get("/", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { members: { include: { user: true } } },
  });
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json({
    id: org.id,
    name: org.name,
    primary_wallet: org.primaryWallet,
    default_platform_fee: org.defaultPlatformFee,
    created_at: org.createdAt,
    members: org.members.map((m) => ({
      user_id: m.userId,
      email: m.user.email,
      role: m.role,
      status: m.status,
    })),
  });
});
