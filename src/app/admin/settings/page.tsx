import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import { getFieldAliases, getReturnTemplate } from "@/lib/services/config-service";
import { RULES_VERSION } from "@/lib/rules/v1/version";
import { PageHeader } from "@/components/ui";
import SettingsEditor from "./SettingsEditor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageUser("ADMIN");
  const db = getDb();

  return (
    <div>
      <PageHeader
        title="系统配置"
        description="字段别名、回传模板和规则版本。配置变更只影响之后的上传与回传，已发布批次保留原规则版本。"
      />
      <SettingsEditor
        initialAliases={getFieldAliases(db)}
        initialTemplate={getReturnTemplate(db)}
        rulesVersion={RULES_VERSION}
      />
    </div>
  );
}
