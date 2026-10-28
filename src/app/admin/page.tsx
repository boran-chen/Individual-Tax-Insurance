import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import {
  downloadedOrgCount,
  listBatches,
  parseStats,
} from "@/lib/services/batch-service";
import { getCurrentMonth } from "@/lib/services/dashboard-service";
import { formatDateTime, formatMoney, formatNumber, monthText } from "@/lib/utils/format";
import {
  Callout,
  PageHeader,
  StatCard,
  StatusBadge,
  EmptyState,
} from "@/components/ui";
import { IconPlus, IconUpload } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requirePageUser("ADMIN");
  const params = await searchParams;
  const db = getDb();

  const monthRows = db
    .prepare("SELECT DISTINCT month FROM batches ORDER BY month DESC LIMIT 36")
    .all() as Array<{ month: string }>;
  const months = monthRows.map((row) => row.month);
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : months[0] ?? getCurrentMonth();

  const batches = listBatches(db, user, { month });
  const activeBatches = batches.filter(
    (batch) => !["SUPERSEDED", "VOIDED"].includes(batch.status),
  );

  const totals = activeBatches.reduce(
    (acc, batch) => {
      const stats = parseStats(batch);
      acc.source += stats.sourceRows;
      acc.valid += stats.validRows;
      acc.anomaly += stats.anomalyRows;
      acc.income += stats.incomeTotalCents;
      if (batch.status === "PUBLISHED") acc.published += 1;
      acc.downloaded += downloadedOrgCount(db, batch.id);
      return acc;
    },
    { source: 0, valid: 0, anomaly: 0, income: 0, published: 0, downloaded: 0 },
  );

  const progressRows = db
    .prepare(
      `SELECT t.status AS status, COUNT(*) AS count
         FROM return_tasks t
         JOIN batches b ON b.id = t.batch_id
        WHERE b.month = ? AND b.status = 'PUBLISHED'
        GROUP BY t.status`,
    )
    .all(month) as Array<{ status: string; count: number }>;
  const returnTotal = progressRows.reduce((sum, row) => sum + Number(row.count), 0);
  const returnPassed =
    progressRows.find((row) => row.status === "PASSED")?.count ?? 0;

  return (
    <div>
      <PageHeader
        title="批次总览"
        description="按月查看佣金总表的上传、拆分、发布与回传状态。"
        actions={
          <>
            <form method="get" className="row" style={{ gap: 8 }}>
              <select className="select input-sm" name="month" defaultValue={month}>
                {months.length ? (
                  months.map((item) => (
                    <option key={item} value={item}>
                      {monthText(item)}
                    </option>
                  ))
                ) : (
                  <option value={month}>{monthText(month)}</option>
                )}
              </select>
              <button className="btn btn-secondary btn-sm" type="submit">
                查看
              </button>
            </form>
            <Link className="btn btn-primary" href="/admin/batches/new">
              <IconPlus width={16} height={16} />
              新建上传
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="源记录数" value={formatNumber(totals.source)} hint={`${monthText(month)} 全部批次`} />
        <StatCard
          label="有效记录"
          value={formatNumber(totals.valid)}
          hint="应税所得 ≥ 0"
          tone="primary"
        />
        <StatCard
          label="异常记录"
          value={formatNumber(totals.anomaly)}
          hint="负数、空值、归属异常等"
          tone={totals.anomaly > 0 ? "warning" : undefined}
        />
        <StatCard
          label="有效应税所得合计"
          value={`¥${formatMoney(totals.income)}`}
          hint="已归属 + 待归属"
          tone="success"
        />
        <StatCard
          label="已发布批次"
          value={formatNumber(totals.published)}
          hint={`下载组织 ${formatNumber(totals.downloaded)} 个`}
        />
        <StatCard
          label="回传通过组织"
          value={`${formatNumber(Number(returnPassed))} / ${formatNumber(returnTotal)}`}
          hint="通过后才进入归集"
          tone={returnTotal > 0 && Number(returnPassed) === returnTotal ? "success" : "warning"}
        />
      </div>

      <div className="stack">
        <Callout tone="info">
          本月流程：上传佣金总表 → 校验并拆分 → 发布批次 → 省负责人下载/回传 → 系统逐条比对 →
          无差异的组织进入归集。回传有差异不会覆盖原始数据，也不会进入归集。
        </Callout>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{monthText(month)} 批次列表</div>
              <div className="card-sub">同月重传会形成新版本，旧版本自动标记为“已替代”。</div>
            </div>
            <span className="badge badge-gray">{batches.length} 个批次</span>
          </div>

          {batches.length === 0 ? (
            <EmptyState
              title="本月还没有批次"
              description="上传人资提供的月度佣金总表，系统会自动识别表头并按省拆分。"
              action={
                <Link className="btn btn-primary" href="/admin/batches/new">
                  <IconUpload width={16} height={16} />
                  上传佣金总表
                </Link>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>月份 / 版本</th>
                    <th>状态</th>
                    <th>源文件</th>
                    <th className="num">源记录</th>
                    <th className="num">有效</th>
                    <th className="num">异常</th>
                    <th className="num">应税所得合计</th>
                    <th>上传人</th>
                    <th>处理时间</th>
                    <th className="num">已下载组织</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => {
                    const stats = parseStats(batch);
                    return (
                      <tr key={batch.id}>
                        <td className="strong">
                          {monthText(batch.month)}
                          <span className="muted" style={{ marginLeft: 6 }}>
                            V{batch.version}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={batch.status} />
                        </td>
                        <td className="wrap" style={{ maxWidth: 260 }}>
                          <span title={batch.original_file_name}>{batch.original_file_name}</span>
                        </td>
                        <td className="num">{formatNumber(stats.sourceRows)}</td>
                        <td className="num">{formatNumber(stats.validRows)}</td>
                        <td className="num">
                          {stats.anomalyRows > 0 ? (
                            <span style={{ color: "var(--warning)" }}>
                              {formatNumber(stats.anomalyRows)}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="num">¥{formatMoney(stats.incomeTotalCents)}</td>
                        <td>{batch.uploader_name}</td>
                        <td className="muted">{formatDateTime(batch.processed_at ?? batch.created_at)}</td>
                        <td className="num">{downloadedOrgCount(db, batch.id)}</td>
                        <td>
                          <Link className="btn btn-secondary btn-sm" href={`/admin/batches/${batch.id}`}>
                            进入批次
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
