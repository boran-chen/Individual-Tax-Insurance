import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
try {
  process.loadEnvFile(envPath);
} catch {
  // .env.local 不存在时使用环境变量
}

async function main(): Promise<void> {
  const { createDatabase } = await import("../src/lib/db");
  const { seedDatabase } = await import("../src/lib/db/seed");
  const db = createDatabase();
  await seedDatabase(db);
  db.close();
  console.log("种子数据已写入");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
