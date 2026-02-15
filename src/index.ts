import "dotenv/config";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { invoicesRouter } from "./routes/invoices.js";
import { organizationRouter } from "./routes/organization.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { teamRouter } from "./routes/team.js";
import { faucetRouter } from "./routes/faucet.js";
import { publicInvoicesRouter } from "./routes/publicInvoices.js";
import { withdrawalsRouter } from "./routes/withdrawals.js";
import { startIndexer } from "./indexer/indexer.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "stablelink-backend" });
});

app.use("/api/public", publicInvoicesRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/organization", organizationRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/team", teamRouter);
app.use("/api/faucet", faucetRouter);
app.use("/api/withdrawals", withdrawalsRouter);

// Only run server and indexer when not on Vercel (serverless handles requests via api/index.js)
if (!process.env.VERCEL) {
  startIndexer();
  app.listen(config.port, () => {
    console.log("StableLink backend listening on port", config.port);
  });
}

export default app;
