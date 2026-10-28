import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");

function ensureEnvFile(): void {
  if (fs.existsSync(envPath)) {
    console.log("已存在 .env.local，跳过密钥生成");
    return;
  }

  const content = [
    "# 由 npm run setup 自动生成",
    `APP_SESSION_SECRET=${crypto.randomBytes(32).toString("base64url")}`,
    `APP_ENCRYPTION_KEY=${crypto.randomBytes(32).toString("base64")}`,
    `APP_ID_HASH_KEY=${crypto.randomBytes(32).toString("base64url")}`,
    "ADMIN_LOGIN=admin",
    "ADMIN_PASSWORD=Admin@12345",
    "ADMIN_NAME=集团管理员",
    "MAX_UPLOAD_MB=50",
    "MAX_ROWS=200000",
    "",
  ].join("\n");

  fs.writeFileSync(envPath, content, { mode: 0o600 });
  console.log("已生成 .env.local（包含随机密钥）");
}

async function main(): Promise<void> {
  ensureEnvFile();
  process.loadEnvFile(envPath);

  for (const dir of ["data", "storage/staging", "storage/uploads", "storage/exports", "storage/returns", "samples"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  const { createDatabase } = await import("../src/lib/db");
  const { seedDatabase } = await import("../src/lib/db/seed");

  const db = createDatabase();
  await seedDatabase(db);
  db.close();

  console.log("");
  console.log("初始化完成。");
  console.log("管理员：", process.env.ADMIN_LOGIN || "admin", "/", process.env.ADMIN_PASSWORD || "Admin@12345");
  console.log("省级演示账号：gd_user / sz_user / bj_user / js_user / zj_user，密码 Prov@12345");
  console.log("下一步：npm run generate:sample && npm run dev");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
