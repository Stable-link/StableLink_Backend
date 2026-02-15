import "dotenv/config";

const required = (key: string): string => {
  const v = process.env[key];
  if (v == null || v === "") throw new Error(`Missing env: ${key}`);
  return v;
};

const optional = (key: string, fallback: string): string => {
  return process.env[key] ?? fallback;
};

export const config = {
  port: parseInt(optional("PORT", "4000"), 10),
  databaseUrl: required("DATABASE_URL"),
  etherlinkRpcUrl: optional("ETHERLINK_RPC_URL", "https://node.shadownet.etherlink.com"),
  chainId: parseInt(optional("CHAIN_ID", "127823"), 10),
  invoicePaymentsAddress: required("INVOICE_PAYMENTS_ADDRESS") as `0x${string}`,
  apiKeyHeader: optional("API_KEY_HEADER", "x-api-key"),
} as const;
