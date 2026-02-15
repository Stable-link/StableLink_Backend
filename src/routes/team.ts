import { Router } from "express";
import { prisma } from "../db.js";
import { requireApiKey } from "../middleware/auth.js";

export const teamRouter = Router();

teamRouter.use(requireApiKey);

teamRouter.post("/invite", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email || !role) {
    res.status(400).json({ error: "email and role required" });
    return;
  }
  if (!["admin", "finance", "viewer"].includes(role)) {
    res.status(400).json({ error: "role must be admin, finance, or viewer" });
    return;
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email } });
  }

  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
  });
  if (existing) {
    res.status(409).json({ error: "User already in organization", member_id: existing.id });
    return;
  }

  const member = await prisma.organizationMember.create({
    data: {
      organizationId: orgId,
      userId: user.id,
      role,
      status: "pending",
    },
    include: { user: true },
  });
  res.status(201).json({
    id: member.id,
    email: member.user.email,
    role: member.role,
    status: member.status,
  });
});
