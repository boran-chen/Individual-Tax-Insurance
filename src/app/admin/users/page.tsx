import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/ui";
import UsersManager from "./UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePageUser("ADMIN");
  const db = getDb();

  const users = db
    .prepare("SELECT id, name, login, role, status, created_at FROM users ORDER BY role, login")
    .all() as unknown as Array<{
    id: string;
    name: string;
    login: string;
    role: "ADMIN" | "PROVINCE";
    status: string;
    created_at: string;
  }>;

  const orgRows = db
    .prepare(
      `SELECT uo.user_id, o.id, o.name FROM user_organizations uo
         JOIN organizations o ON o.id = uo.org_id ORDER BY o.sort_order`,
    )
    .all() as Array<{ user_id: string; id: string; name: string }>;

  const orgsByUser = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of orgRows) {
    const list = orgsByUser.get(row.user_id) ?? [];
    list.push({ id: row.id, name: row.name });
    orgsByUser.set(row.user_id, list);
  }

  const organizations = (
    db
      .prepare("SELECT id, name, short_name FROM organizations WHERE status = 'ACTIVE' ORDER BY sort_order")
      .all() as Array<{ id: string; name: string; short_name: string }>
  ).map((org) => ({ id: org.id, name: org.name, short_name: org.short_name }));

  return (
    <div>
      <PageHeader
        title="账号与权限"
        description="管理员维护账号与组织的绑定关系。省负责人只能访问已绑定组织的数据，权限变更立即生效。"
      />
      <UsersManager
        initialUsers={users.map((user) => ({
          id: user.id,
          name: user.name,
          login: user.login,
          role: user.role,
          status: user.status,
          createdAt: user.created_at,
          orgs: orgsByUser.get(user.id) ?? [],
        }))}
        organizations={organizations}
      />
    </div>
  );
}
