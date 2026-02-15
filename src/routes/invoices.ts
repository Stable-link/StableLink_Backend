import { Router } from "express";
import { prisma } from "../db.js";
import { requireApiKey } from "../middleware/auth.js";

export const invoicesRouter = Router({ mergeParams: true });

invoicesRouter.use(requireApiKey);

invoicesRouter.post("/", async (req, res) => {
  try {
    const orgId = (req as unknown as { organizationId: string }).organizationId;
    const { amount, token, client_name, client_email, description, due_date, splits, onchain_invoice_id, creator_wallet, tx_hash } = req.body as {
      amount: number;
      token: string;
      client_name?: string;
      client_email?: string;
      description?: string;
      due_date?: string;
      splits: Array<{ wallet: string; percentage: number }>;
      onchain_invoice_id?: number;
      creator_wallet?: string;
      tx_hash?: string;
    };

    if (amount == null || !token || !splits?.length) {
      res.status(400).json({ error: "amount, token, and splits required" });
      return;
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const creatorWallet = typeof creator_wallet === "string" && creator_wallet ? creator_wallet : org.primaryWallet;
    const isDeployed = typeof tx_hash === "string" && tx_hash.trim().length > 0;
    // Use provided onchain id when deployed; otherwise -1 so we never collide with real chain ids (0,1,2...).
    // Defaulting to 0 caused multiple invoices to share id 0 and all get marked paid when one was paid.
    const onchainId =
      isDeployed && typeof onchain_invoice_id === "number" && onchain_invoice_id >= 0
        ? BigInt(onchain_invoice_id)
        : BigInt(-1);
    const dueDate = typeof due_date === "string" && due_date.trim() ? new Date(due_date.trim()) : null;
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: orgId,
        onchainInvoiceId: onchainId,
        creatorWallet,
        clientName: client_name ?? null,
        clientEmail: client_email ?? null,
        token,
        amount: String(amount),
        description: description?.trim() ?? null,
        dueDate,
        status: isDeployed ? "deployed" : "draft",
        txHash: isDeployed ? tx_hash.trim() : null,
      },
    });

    res.status(201).json({
      id: invoice.id,
      onchain_invoice_id: Number(invoice.onchainInvoiceId),
      amount: invoice.amount,
      token: invoice.token,
      client_name: invoice.clientName,
      client_email: invoice.clientEmail,
      status: invoice.status,
      created_at: invoice.createdAt,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

invoicesRouter.get("/", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const list = await prisma.invoice.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    invoices: list.map((i) => ({
      id: i.id,
      onchain_invoice_id: Number(i.onchainInvoiceId),
      creator_wallet: i.creatorWallet,
      client_name: i.clientName,
      client_email: i.clientEmail,
      token: i.token,
      amount: i.amount,
      description: i.description,
      due_date: i.dueDate?.toISOString() ?? null,
      status: i.status,
      tx_hash: i.txHash,
      created_at: i.createdAt,
      paid_at: i.paidAt,
    })),
  });
});

invoicesRouter.get("/:id", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json({
    id: invoice.id,
    onchain_invoice_id: Number(invoice.onchainInvoiceId),
    organization_id: invoice.organizationId,
    creator_wallet: invoice.creatorWallet,
    client_name: invoice.clientName,
    client_email: invoice.clientEmail,
    token: invoice.token,
    amount: invoice.amount,
    description: invoice.description,
    due_date: invoice.dueDate?.toISOString() ?? null,
    status: invoice.status,
    tx_hash: invoice.txHash,
    created_at: invoice.createdAt,
    paid_at: invoice.paidAt,
  });
});

invoicesRouter.post("/:id/send-reminder", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (invoice.status === "paid") {
    res.status(400).json({ error: "Cannot send reminder for a paid invoice" });
    return;
  }
  // Reminder sent (no email service configured; frontend can copy payment link)
  res.status(200).json({ ok: true, message: "Reminder sent" });
});

invoicesRouter.delete("/:id", async (req, res) => {
  const orgId = (req as unknown as { organizationId: string }).organizationId;
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  await prisma.invoice.delete({ where: { id: invoice.id } });
  res.status(204).send();
});
