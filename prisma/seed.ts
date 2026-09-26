import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const operatingOrgId =
    process.env.OPERATING_ORGANIZATION_ID ??
    "00000000-0000-0000-0000-000000000001";

  console.log(`Seeding default operating organization (${operatingOrgId})...`);

  const org = await prisma.organization.upsert({
    where: { id: operatingOrgId },
    update: {
      status: "ACTIVE",
    },
    create: {
      id: operatingOrgId,
      name: "ApplyCitrux Operations",
      slug: "apply-citrux",
      status: "ACTIVE",
    },
  });

  console.log(`Operating organization ready: ${org.name} [${org.id}] (${org.status})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
