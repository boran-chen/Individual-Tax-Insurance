import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import { getBatchForUser } from "@/lib/services/batch-service";
import { getReturnProgress } from "@/lib/services/return-service";
import { formatDateTime, formatNumber, monthText } from "@/lib/utils/format";
import { PageHeader, StatCard, StatusBadge, EmptyState } from "@/components/ui";
import { IconChevronLeft, IconReturns } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminBatchReturnsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser("ADMIN");
  const { id } = await params;
  const db = getDb();

  const batch = (() => {
    try {
      return getBatchForUser(db, user, id);
    } catch {
      notFound();
    }
  })();

  const progress = getReturnProgress(db, user, id);
  const counts = progress.reduce<Record<string, number>>((acc, row) => {
    acc[row.task_status] = (acc[row.task_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title={`回传进度 · ${monthText(batch.month)} V${batch.version}`}
        description="只有回传零差异的组织才会进入当月归集；不通过的组织会保留差异明细，可重新回传。"
        actions={
          <>
            <Link className="btn btn-secondary" href={`/admin/batches/${id}`}>
              <IconChevronLeft width={15} height={15} />
              返回批次
            </Link>
            <Link className="btn btn-primary" href={`/admin/aggregation?month=${batch.month}`}>
              <IconReturns width={15} height={15} />
              查看归集
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="组织总数" value={formatNumber(progress.length)} />
        <StatCard label="已通过" value={formatNumber(counts.PASSED ?? 0)} tone="success" />
        <StatCard
          label="不通过"
          value={formatNumber((counts.REJECTED ?? 0) + (counts.COMPARE_ERROR ?? 0))}
          tone={(counts.REJECTED ?? 0) + (counts.COMPARE_ERROR ?? 0) ? "danger" : undefined}
        />
        <StatCard
          label="待比对"
          value={formatNumber((counts.PENDING_COMPARE ?? 0) + (counts.COMPARING ?? 0))}
          tone="primary"
        />
        <StatCard label="未回传" value={formatNumber(counts.NOT_SUBMITTED ?? 0)} />
        <StatCard
          label="通过率"
          value={
            progress.length
              ? `${Math.round(((counts.PASSED ?? 0) / progress.length) * 100)}%`
              : "0%"
          }
          hint="按组织数统计"
        />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">各组织回传状态</div>
            <div className="card-sub">展示每个组织最新一次回传及比对结果。</div>
          </div>
          <span className="badge badge-gray">{progress.length} 个组织</span>
        </div>

        {progress.length === 0 ? (
          <EmptyState
            title="还没有回传任务"
            description="批次发布后系统会为有数据的组织生成回传任务。"
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>组织</th>
                  <th>任务状态</th>
                  <th>最新版本</th>
                  <th>回传文件</th>
                  <th>回传时间</th>
                  <th>比对时间</th>
                  <th className="num">记录 / 匹配</th>
                  <th className="num">差异</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((row) => (
                  <tr key={row.org_id}>
                    <td className="strong">{row.org_name}</td>
                    <td>
                      <StatusBadge status={row.task_status} />
                    </td>
                    <td>{row.submission_version ? `V${row.submission_version}` : "—"}</td>
                    <td className="wrap" style={{ maxWidth: 220 }}>
                      {row.file_name ?? "—"}
                    </td>
                    <td className="muted">{formatDateTime(row.created_at)}</td>
                    <td className="muted">{formatDateTime(row.compared_at)}</td>
                    <td className="num">
                      {row.total_rows === null
                        ? "—"
                        : `${formatNumber(row.total_rows)} / ${formatNumber(row.matched_rows)}`}
                    </td>
                    <td className="num">
                      {row.diff_count === null ? (
                        "—"
                      ) : row.diff_count > 0 ? (
                        <span style={{ color: "var(--danger)" }}>{formatNumber(row.diff_count)}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td>
                      {row.submission_id ? (
                        <Link
                          className="btn btn-secondary btn-sm"
                          href={`/admin/returns/${row.submission_id}`}
                        >
                          查看明细
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
