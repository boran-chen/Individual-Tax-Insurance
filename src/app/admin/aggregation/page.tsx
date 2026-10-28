import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import {
  aggregationTotals,
  getActiveBatchForMonth,
  getReturnProgress,
  listAggregations,
} from "@/lib/services/return-service";
import { getCurrentMonth } from "@/lib/services/dashboard-service";
import { formatDateTime, formatMoney, formatNumber, monthText } from "@/lib/utils/format";
import {
  Callout,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { IconDownload } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AggregationPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requirePageUser("ADMIN");
  const params = await searchParams;
  const db = getDb();

  const monthRows = db
    .prepare(
      "SELECT DISTINCT month FROM batches WHERE status IN ('PUBLISHED','SUPERSEDED') ORDER BY month DESC LIMIT 36",
    )
    .all() as Array<{ month: string }>;
  const months = monthRows.map((row) => row.month);
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : months[0] ?? getCurrentMonth();

  const rows = listAggregations(db, month);
  const totals = aggregationTotals(rows);
  const activeBatch = getActiveBatchForMonth(db, month);
  const progress = activeBatch ? getReturnProgress(db, user, activeBatch.id) : [];
  const activeOrgIds = new Set(rows.filter((row) => row.status === "ACTIVE").map((row) => row.org_id));
  const pending = progress.filter((item) => !activeOrgIds.has(item.org_id));

  return (
    <div>
      <PageHeader
        title="回传与归集"
        description="以每个组织最新一次回传为准；只有比对通过的组织才进入当月归集。"
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
            {totals.orgCount > 0 ? (
              <a className="btn btn-primary" href={`/api/aggregation/export?month=${month}`}>
                <IconDownload width={16} height={16} />
                导出归集汇总
              </a>
            ) : null}
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="已归集组织" value={formatNumber(totals.orgCount)} tone="success" />
        <StatCard label="归集记录数" value={formatNumber(totals.recordCount)} tone="primary" />
        <StatCard label="归集应税所得" value={`¥${formatMoney(totals.incomeCents)}`} />
        <StatCard label="待归集 / 未通过" value={formatNumber(pending.length)} tone={pending.length ? "warning" : undefined} />
        <StatCard
          label="回传通过率"
          value={progress.length ? `${Math.round((totals.orgCount / progress.length) * 100)}%` : "—"}
          hint={activeBatch ? `批次 V${activeBatch.version}` : "当月暂无发布批次"}
        />
        <StatCard
          label="当月发布批次"
          value={activeBatch ? `V${activeBatch.version}` : "—"}
          hint={activeBatch ? formatDateTime(activeBatch.published_at) : undefined}
        />
      </div>

      <div className="stack">
        <Callout tone="info">
          归集口径：同一组织当月如果重新回传，以最新一次结果为准。最新为“不通过/未回传”的组织会从归集中剔除，
          不会保留旧版本的归集数据；历史回传版本仍可在批次回传进度中追溯。
        </Callout>

        {!activeBatch ? (
          <EmptyState
            title={`${monthText(month)} 没有已发布批次`}
            description="请先在批次总览中上传并发布该月批次。"
            action={
              <Link className="btn btn-primary" href="/admin/batches/new">
                新建上传
              </Link>
            }
          />
        ) : null}

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">归集结果</div>
              <div className="card-sub">
                {monthText(month)} · 已通过 {totals.orgCount} 个组织 · 记录 {formatNumber(totals.recordCount)} 条 ·
                应税所得 ¥{formatMoney(totals.incomeCents)}
              </div>
            </div>
            {activeBatch ? (
              <Link className="btn btn-secondary btn-sm" href={`/admin/batches/${activeBatch.id}/returns`}>
                回传进度
              </Link>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="暂无归集记录" description="省负责人回传并无差异通过后，这里会出现归集结果。" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>组织</th>
                    <th>归集状态</th>
                    <th className="num">记录数</th>
                    <th className="num">应税所得合计</th>
                    <th>批次版本</th>
                    <th>归集时间</th>
                    <th>回传明细</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="strong">{row.org_name}</td>
                      <td>
                        <StatusBadge
                          status={row.status}
                          label={row.status === "ACTIVE" ? "已归集" : "未归集"}
                        />
                      </td>
                      <td className="num">{formatNumber(row.record_count)}</td>
                      <td className="num">¥{formatMoney(row.income_cents)}</td>
                      <td>V{row.batch_version}</td>
                      <td className="muted">{formatDateTime(row.aggregated_at)}</td>
                      <td>
                        <Link className="btn btn-secondary btn-sm" href={`/admin/returns/${row.submission_id}`}>
                          查看比对
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {activeBatch ? (
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">未归集组织</div>
                <div className="card-sub">以下组织的最新回传未通过或尚未回传，已从归集中排除。</div>
              </div>
              <span className="badge badge-gray">{pending.length} 个</span>
            </div>
            {pending.length === 0 ? (
              <EmptyState title="全部组织已归集" description="当月有数据的组织均已通过比对。" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>组织</th>
                      <th>任务状态</th>
                      <th>最新回传</th>
                      <th className="num">差异数</th>
                      <th>说明</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row) => (
                      <tr key={row.org_id}>
                        <td className="strong">{row.org_name}</td>
                        <td>
                          <StatusBadge status={row.task_status} />
                        </td>
                        <td>{row.submission_version ? `V${row.submission_version}` : "—"}</td>
                        <td className="num">{row.diff_count ?? "—"}</td>
                        <td className="wrap">
                          {row.error_message ??
                            (row.task_status === "NOT_SUBMITTED"
                              ? "尚未回传"
                              : row.task_status === "REJECTED"
                                ? "存在差异，需修正后重新回传"
                                : "等待比对结果")}
                        </td>
                        <td>
                          {row.submission_id ? (
                            <Link className="btn btn-secondary btn-sm" href={`/admin/returns/${row.submission_id}`}>
                              查看
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
