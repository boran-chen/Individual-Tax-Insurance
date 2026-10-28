import { ORGANIZATIONS } from "../config/organizations";
import { DEFAULT_RETURN_TEMPLATE } from "../config/return-template";
import { normalizeOrgText } from "../rules/v1/text";
import { hashPassword } from "../auth/password";
import { newId, nowIso, type Db } from "./index";

export type SeedOptions = {
  adminLogin?: string;
  adminPassword?: string;
  adminName?: string;
  includeDemoUsers?: boolean;
};

const DEMO_USERS = [
  { login: "gd_user", name: "广东负责人", orgCode: "440000" },
  { login: "sz_user", name: "深圳负责人", orgCode: "440300" },
  { login: "bj_user", name: "北京负责人", orgCode: "110000" },
  { login: "js_user", name: "江苏负责人", orgCode: "320000" },
  { login: "zj_user", name: "浙江负责人", orgCode: "330000" },
];

export async function seedDatabase(db: Db, options: SeedOptions = {}): Promise<void> {
  const now = nowIso();

  const upsertOrg = db.prepare(
    `INSERT INTO organizations (id, code, name, short_name, province_code, type, sort_order, status)
     VALUES (?, ?, ?, ?, ?, 'PROVINCE', ?, 'ACTIVE')
     ON CONFLICT(code) DO UPDATE SET
       name = excluded.name,
       short_name = excluded.short_name,
       province_code = excluded.province_code,
       sort_order = excluded.sort_order`,
  );

  const insertMapping = db.prepare(
    `INSERT OR IGNORE INTO province_mappings (id, source_value, org_id, active, updated_at)
     VALUES (?, ?, ?, 1, ?)`,
  );

  for (const org of ORGANIZATIONS) {
    const orgId = `ORG-${org.code}`;
    upsertOrg.run(
      orgId,
      org.code,
      org.name,
      org.shortName,
      org.provinceCode,
      org.sortOrder,
    );

    const values = new Set<string>([
      org.name,
      org.shortName,
      ...org.aliases,
      `${org.shortName}分公司`,
    ]);
    for (const value of values) {
      const normalized = normalizeOrgText(value);
      if (!normalized) continue;
      insertMapping.run(newId(), normalized, orgId, now);
    }
  }

  const adminLogin = options.adminLogin ?? process.env.ADMIN_LOGIN ?? "admin";
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? "Admin@12345";
  const adminName = options.adminName ?? process.env.ADMIN_NAME ?? "集团管理员";

  const adminExisting = db
    .prepare("SELECT id FROM users WHERE login = ?")
    .get(adminLogin) as { id: string } | undefined;

  if (!adminExisting) {
    const passwordHash = await hashPassword(adminPassword);
    db.prepare(
      `INSERT INTO users (id, name, login, password_hash, role, status, session_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE', 1, ?, ?)`,
    ).run(newId(), adminName, adminLogin, passwordHash, now, now);
  }

  if (options.includeDemoUsers !== false) {
    for (const demo of DEMO_USERS) {
      const existing = db
        .prepare("SELECT id FROM users WHERE login = ?")
        .get(demo.login) as { id: string } | undefined;

      let userId = existing?.id;
      if (!userId) {
        userId = newId();
        const passwordHash = await hashPassword("Prov@12345");
        db.prepare(
          `INSERT INTO users (id, name, login, password_hash, role, status, session_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'PROVINCE', 'ACTIVE', 1, ?, ?)`,
        ).run(userId, demo.name, demo.login, passwordHash, now, now);
      }

      const org = db
        .prepare("SELECT id FROM organizations WHERE code = ?")
        .get(demo.orgCode) as { id: string } | undefined;
      if (org && userId) {
        db.prepare(
          `INSERT OR IGNORE INTO user_organizations (user_id, org_id, effective_from, effective_to)
           VALUES (?, ?, ?, NULL)`,
        ).run(userId, org.id, now);
      }
    }
  }

  const insertConfig = db.prepare(
    `INSERT OR IGNORE INTO app_config (key, value_json, updated_by, updated_at, version)
     VALUES (?, ?, NULL, ?, 1)`,
  );
  insertConfig.run("return_template", JSON.stringify(DEFAULT_RETURN_TEMPLATE), now);
  insertConfig.run("field_aliases", JSON.stringify({}), now);
}
