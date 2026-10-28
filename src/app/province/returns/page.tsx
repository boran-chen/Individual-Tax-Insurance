import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import { getBatchForUser, listBatches } from "@/lib/services/batch-service";
import {
  getReturnProgress,
  listSubmissionsForOrg,
  type ReturnProgressRow,
} from "@/lib/services/return-service";
import { PageHeader, Callout } from "@/components/ui";
import ReturnUploader from "./ReturnUploader";

export const dynamic = "force-dynamic";

type ProvinceReturnTask = ReturnProgressRow & {
  batch_id: string;
  month: string;
  batch_version: number;
};

export default async function ProvinceReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; orgId?: string }>;
}) {
  const user = await requirePageUser("PROVINCE");
  const params = await searchParams;
  const db = getDb();

  const batches = listBatches(db, user, {});
  const tasks: ProvinceReturnTask[] = [];
  for (const batch of batches) {
    const progress = getReturnProgress(db, user, batch.id);
    for (const row of progress) {
      tasks.push({
        ...row,
        batch_id: batch.id,
        month: batch.month,
        batch_version: batch.version,
      });
    }
  }

  const selected =
    tasks.find(
      (task) => task.batch_id === params.batchId && task.org_id === params.orgId,
    ) ??
    tasks.find((task) => task.batch_id === params.batchId) ??
    tasks[0];

  let submissions: Awaited<ReturnType<typeof listSubmissionsForOrg>> = [];
  if (selected) {
    // 权限校验：仅允许本人组织
    getBatchForUser(db, user, selected.batch_id);
    submissions = listSubmissionsForOrg(db, selected.batch_id, selected.org_id);
  }

  return (
    <div>
      <PageHeader
        title="回传与结果"
        description="下载申报数据加工后，在这里上传回传文件。系统会自动与原始数据逐条比对，有差异不通过。"
      />

      <div className="mb-4">
        <Callout tone="info">
          回传文件默认读取“3劳动报酬收入”Sheet。请保持证件号码为文本格式；系统按“证件号码 + 姓名 + 收入”
          逐条比对，缺人、多人、金额不一致都会判为不通过。不通过的文件不会覆盖原始数据。
        </Callout>
      </div>

      <ReturnUploader
        key={`${selected?.batch_id ?? "none"}|${selected?.org_id ?? "none"}`}
        tasks={tasks}
        selectedBatchId={selected?.batch_id ?? null}
        selectedOrgId={selected?.org_id ?? null}
        submissions={submissions}
      />
    </div>
  );
}
