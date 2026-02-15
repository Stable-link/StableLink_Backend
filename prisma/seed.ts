import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Default Organization",
        primaryWallet: "0x0000000000000000000000000000000000000000",
        defaultPlatformFee: 300,
      },
    });
  }
  let apiKey = await prisma.apiKey.findFirst({ where: { organizationId: org.id } });
  const testKey = "sk_test_stablelink_default_key_replace_in_production";
  if (!apiKey) {
    apiKey = await prisma.apiKey.create({
      data: { organizationId: org.id, testKey },
    });
  } else {
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { testKey },
    });
  }
  console.log("Seed done. Use API key (x-api-key or Authorization: Bearer):", testKey);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
