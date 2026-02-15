import { Router } from "express";
import { prisma } from "../db.js";

/**
 * Public invoice lookup for checkout/payment links.
 * No API key required - invoice id (cuid) is unguessable.
 */
export const publicInvoicesRouter = Router();

publicInvoicesRouter.get("/invoices/:id", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
  });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json({
    id: invoice.id,
    onchain_invoice_id: Number(invoice.onchainInvoiceId),
    amount: invoice.amount,
    token: invoice.token,
    client_name: invoice.clientName,
    client_email: invoice.clientEmail,
    creator_wallet: invoice.creatorWallet,
    status: invoice.status,
    description: invoice.description,
    due_date: invoice.dueDate?.toISOString() ?? null,
  });
});
