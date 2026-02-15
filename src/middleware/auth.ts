import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers[config.apiKeyHeader.toLowerCase()] ?? req.headers.authorization;
  const raw = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : header;
  const apiKey = typeof raw === "string" ? raw : null;

  if (!apiKey) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const keyRecord = await prisma.apiKey.findFirst({
    where: { OR: [{ liveKey: apiKey }, { testKey: apiKey }] },
    include: { organization: true },
  });

  if (!keyRecord) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  (req as Request & { organizationId: string }).organizationId = keyRecord.organizationId;
  next();
}
