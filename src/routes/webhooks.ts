import { Router } from "express";
import { prisma } from "../db.js";
import { requireApiKey } from "../middleware/auth.js";

export const webhooksRouter = Router();

webhooksRouter.use(requireApiKey);

webhooksRouter.post("/", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const { url, subscribed_events } = req.body as { url?: string; subscribed_events?: string[] };
  if (!url || !subscribed_events?.length) {
    res.status(400).json({ error: "url and subscribed_events required" });
    return;
  }
  const webhook = await prisma.webhook.create({
    data: {
      organizationId: orgId,
      url,
      subscribedEvents: subscribed_events,
    },
  });
  res.status(201).json({
    id: webhook.id,
    url: webhook.url,
    subscribed_events: webhook.subscribedEvents,
    created_at: webhook.createdAt,
  });
});

webhooksRouter.get("/", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const list = await prisma.webhook.findMany({ where: { organizationId: orgId } });
  res.json({
    webhooks: list.map((w) => ({
      id: w.id,
      url: w.url,
      subscribed_events: w.subscribedEvents,
      created_at: w.createdAt,
    })),
  });
});
