import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/ui";
import MappingsManager from "./MappingsManager";

export const dynamic = "force-dynamic";

export default async function MappingsPage() {
  await requirePageUser("ADMIN");
  const db = getDb();

  const mappings = db
    .prepare(
      `SELECT pm.id, pm.source_value, pm.org_id, pm.active, pm.updated_at,
              o.name AS org_name, o.short_name
         FROM province_mappings pm
         JOIN organizations o ON o.id = pm.org_id
        ORDER BY pm.active DESC, o.sort_order, pm.source_value`,
    )
    .all() as unknown as Array<{
    id: string;
    source_value: string;
    org_id: string;
    active: number;
    updated_at: string;
    org_name: string;
    short_name: string;
  }>;

  const organizations = (
    db
      .prepare("SELECT id, name, short_name FROM organizations WHERE status = 'ACTIVE' ORDER BY sort_order")
      .all() as Array<{ id: string; name: string; short_name: string }>
  ).map((org) => ({ id: org.id, name: org.name, short_name: org.short_name }));

  return (
    <div>
      <PageHeader
        title="省份映射"
        description="维护“渠道机构所在省”源值与标准组织的对应关系。含“深圳”优先归深圳分公司，其次含“广东”归广东分公司，这两条规则始终优先于映射表。"
      />
      <MappingsManager
        initialMappings={mappings.map((item) => ({
          id: item.id,
          sourceValue: item.source_value,
          orgId: item.org_id,
          orgName: item.org_name,
          shortName: item.short_name,
          active: item.active === 1,
          updatedAt: item.updated_at,
        }))}
        organizations={organizations}
      />
    </div>
  );
}
