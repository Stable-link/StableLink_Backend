import { Contract, EventLog, JsonRpcProvider } from "ethers";
import { config } from "../config.js";
import { prisma } from "../db.js";
import abi from "../abi/InvoicePayments.json" with { type: "json" };

const INDEXER_KEY = "invoice_payments_last_block";
const POLL_MS = 15_000; // Poll less often to avoid RPC rate limits
const MAX_BLOCK_RANGE = 200; // Etherlink RPC block range limit
const DELAY_BETWEEN_REQUESTS_MS = 800; // Delay between eth_getLogs to stay under rate limit
const RATE_LIMIT_RETRY_DELAY_MS = 12_000; // Wait 12s on rate limit (RPC says "retry in 10s")
const RATE_LIMIT_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const code = (err as { error?: { code?: number }; code?: number })?.error?.code ?? (err as { code?: number })?.code;
  const message = String((err as { error?: { message?: string }; message?: string })?.error?.message ?? (err as { message?: string })?.message ?? "");
  return code === -32090 || /rate limit|retry in/i.test(message);
}

export function startIndexer(): void {
  const provider = new JsonRpcProvider(config.etherlinkRpcUrl);
  const contract = new Contract(config.invoicePaymentsAddress, abi as never, provider);

  async function getLastBlock(): Promise<bigint> {
    const row = await prisma.indexerState.findUnique({ where: { key: INDEXER_KEY } });
    if (row) return row.lastBlock;
    const block = await provider.getBlockNumber();
    await prisma.indexerState.upsert({
      where: { key: INDEXER_KEY },
      create: { key: INDEXER_KEY, lastBlock: BigInt(block) },
      update: {},
    });
    return BigInt(block);
  }

  async function setLastBlock(block: number): Promise<void> {
    await prisma.indexerState.upsert({
      where: { key: INDEXER_KEY },
      create: { key: INDEXER_KEY, lastBlock: BigInt(block) },
      update: { lastBlock: BigInt(block) },
    });
  }

  async function dispatchWebhooks(event: string, payload: object): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
      where: { subscribedEvents: { has: event } },
    });
    for (const w of webhooks) {
      fetch(w.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, ...payload }),
      }).catch((err) => console.error("Webhook dispatch failed:", w.url, err));
    }
  }

  async function queryFilterChunked(
    event: string,
    fromBlock: number,
    toBlock: number
  ): Promise<EventLog[]> {
    const allEvents: EventLog[] = [];
    const eventFilter = contract.getEvent(event);

    for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE) {
      const end = Math.min(start + MAX_BLOCK_RANGE - 1, toBlock);
      const blockCount = end - start + 1;
      let lastErr: unknown;
      let retries = 0;

      while (retries <= RATE_LIMIT_MAX_RETRIES) {
        try {
          const events = await contract.queryFilter(eventFilter, start, end);
          for (const ev of events) {
            if (ev instanceof EventLog) {
              allEvents.push(ev);
            }
          }
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          if (isRateLimitError(err) && retries < RATE_LIMIT_MAX_RETRIES) {
            retries++;
            console.warn(
              `Rate limited on ${event} [${start}-${end}], waiting ${RATE_LIMIT_RETRY_DELAY_MS / 1000}s (retry ${retries}/${RATE_LIMIT_MAX_RETRIES})`
            );
            await sleep(RATE_LIMIT_RETRY_DELAY_MS);
            continue;
          }
          console.error(`Error querying ${event} from block ${start} to ${end} (${blockCount} blocks):`, err);
          throw err;
        }
      }

      if (lastErr) throw lastErr;

      // Throttle: delay between requests to avoid rate limit
      if (start + MAX_BLOCK_RANGE <= toBlock) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    return allEvents;
  }

  async function run(): Promise<void> {
    try {
      const from = await getLastBlock();
      const to = await provider.getBlockNumber();
      if (from >= to) return;

      const fromBlock = Number(from) + 1;

      // Query events sequentially (not in parallel) to avoid RPC rate limit
      const created = await queryFilterChunked("InvoiceCreated", fromBlock, to);
      const paid = await queryFilterChunked("InvoicePaid", fromBlock, to);
      const cancelled = await queryFilterChunked("InvoiceCancelled", fromBlock, to);
      const withdrawal = await queryFilterChunked("Withdrawal", fromBlock, to);

      for (const ev of created) {
        if (!(ev instanceof EventLog)) continue;
        const args = ev.args as unknown as { invoiceId: bigint; creator: string; token: string; amount: bigint };
        await dispatchWebhooks("invoice.created", {
          invoiceId: Number(args.invoiceId),
          creator: args.creator,
          token: args.token,
          amount: args.amount.toString(),
        });
      }

      for (const ev of paid) {
        if (!(ev instanceof EventLog)) continue;
        const args = ev.args as unknown as { invoiceId: bigint; payer: string; amount: bigint };
        const txHash = ev.transactionHash;
        await prisma.invoice.updateMany({
          where: { onchainInvoiceId: args.invoiceId },
          data: {
            status: "paid",
            paidAt: new Date(),
            txHash: txHash ?? undefined,
          },
        });
        await dispatchWebhooks("invoice.paid", {
          invoiceId: Number(args.invoiceId),
          payer: args.payer,
          amount: args.amount.toString(),
          txHash,
        });
      }

      for (const ev of cancelled) {
        if (!(ev instanceof EventLog)) continue;
        const args = ev.args as unknown as { invoiceId: bigint };
        await prisma.invoice.updateMany({
          where: { onchainInvoiceId: args.invoiceId },
          data: { status: "cancelled" },
        });
        await dispatchWebhooks("invoice.cancelled", { invoiceId: Number(args.invoiceId) });
      }

      for (const ev of withdrawal) {
        if (!(ev instanceof EventLog)) continue;
        const args = ev.args as unknown as { user: string; token: string; amount: bigint };
        await dispatchWebhooks("withdrawal.completed", {
          user: args.user,
          token: args.token,
          amount: args.amount.toString(),
        });
      }

      await setLastBlock(to);
    } catch (err) {
      console.error("Indexer run error:", err);
    }
  }

  run();
  setInterval(run, POLL_MS);
  console.log("Event indexer started (poll every %s ms)", POLL_MS);
}
