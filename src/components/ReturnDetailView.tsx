import Link from "next/link";
import type { ReturnDiffRow, ReturnSubmissionRow } from "@/lib/services/return-service";
import { formatDateTime, formatMoney, formatNumber, monthText } from "@/lib/utils/format";
import { DIFF_LABELS } from "@/lib/utils/labels";
import {
  Callout,
  EmptyState,
  PageHeader,
  Pagination,
  StatCard,
  StatusBadge,
  TabLinks,
} from "@/components/ui";
import { IconChevronLeft } from "@/components/icons";

function diffTone(type: string): string {
  if (type === "MISSING_IN_RETURN" || type === "DUPLICATE_KEY") return "badge-red";
  if (type === "EXTRA_IN_RETURN") return "badge-amber";
  if (type === "AMOUNT_MISMATCH") return "badge-red";
  return "badge-amber";
}

export default function ReturnDetailView({
  batch,
  orgName,
  submission,
  diffStats,
  diffs,
  page,
  pageSize,
  filterType,
  makeHref,
  backHref,
  aggregation,
}: {
  batch: { month: string; version: number };
  orgName: string;
  submission: ReturnSubmissionRow;
  diffStats: Array<{ type: string; count: number }>;
  diffs: { rows: ReturnDiffRow[]; total: number };
  page: number;
  pageSize: number;
  filterType: string;
  makeHref: (page: number, type: string | null) => string;
  backHref: string;
  aggregation: { record_count: number; income_cents: number; aggregated_at: string; status: string } | null;
}) {
  const typeItems = [
    { key: "", label: `全部差异 (${formatNumber(submission.diff_count)})`, href: makeHref(1, null) },
    ...diffStats.map((item) => ({
      key: item.type,
      label: `${DIFF_LABELS[item.type] ?? item.type} (${formatNumber(item.count)})`,
      href: makeHref(1, item.type),
    })),
  ];

  return (
    <div>
      <PageHeader
        title="回传比对明细"
        description={`${monthText(batch.month)} · V${batch.version} · ${orgName} · 回传版本 V${submission.version}`}
        actions={
          <Link className="btn btn-secondary" href={backHref}>
            <IconChevronLeft width={15} height={15} />
            返回回传列表
          </Link>
        }
      />

      {submission.status === "PASSED" ? (
        <div className="mb-4">
          <Callout tone="success">
            <strong>比对通过。</strong>
            {aggregation
              ? `已进入 ${monthText(batch.month)} 归集：记录 ${formatNumber(aggregation.record_count)} 条，应税所得合计 ¥${formatMoney(aggregation.income_cents)}。`
              : "回传与原始数据完全一致，等待归集。"}
          </Callout>
        </div>
      ) : submission.status === "FAILED" ? (
        <div className="mb-4">
          <Callout tone="danger">
            <strong>比对不通过：</strong>发现 {formatNumber(submission.diff_count)} 条差异，本次回传不会覆盖原始数据，也不会进入归集。请修正后重新回传。
          </Callout>
        </div>
      ) : submission.status === "PARSE_ERROR" ? (
        <div className="mb-4">
          <Callout tone="danger">
            <strong>回传文件解析失败：</strong>
            {submission.error_message ?? "请检查文件格式和列名。"}
          </Callout>
        </div>
      ) : (
        <div className="mb-4">
          <Callout tone="info">正在比对，请稍后刷新页面。</Callout>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="回传记录数" value={formatNumber(submission.total_rows)} />
        <StatCard label="匹配记录数" value={formatNumber(submission.matched_rows)} tone="success" />
        <StatCard
          label="差异数"
          value={formatNumber(submission.diff_count)}
          tone={submission.diff_count > 0 ? "danger" : undefined}
        />
        <StatCard label="比对状态" value={<StatusBadge status={submission.status} />} />
        <StatCard
          label="归集状态"
          value={
            aggregation ? (
              <span className="badge badge-green">已归集</span>
            ) : (
              <span className="badge badge-gray">未归集</span>
            )
          }
          hint={aggregation ? formatDateTime(aggregation.aggregated_at) : undefined}
        />
        <StatCard label="比对引擎" value={submission.engine_version} hint="规则版本固定留痕" />
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <dl className="kv">
            <dt>回传文件</dt>
            <dd>{submission.file_name}</dd>
            <dt>回传时间</dt>
            <dd>{formatDateTime(submission.created_at)}</dd>
            <dt>比对时间</dt>
            <dd>{formatDateTime(submission.compared_at)}</dd>
            <dt>文件摘要</dt>
            <dd className="mono">{submission.sha256.slice(0, 24)}…</dd>
            {submission.error_message ? (
              <>
                <dt>错误信息</dt>
                <dd style={{ color: "var(--danger)" }}>{submission.error_message}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">差异明细</div>
            <div className="card-sub">
              以“证件号码 + 姓名”为键逐条比对；金额精确到分。证件号码仅显示掩码。
            </div>
          </div>
          <span className="badge badge-gray">共 {formatNumber(diffs.total)} 条</span>
        </div>

        {diffStats.length > 0 ? <TabLinks items={typeItems} active={filterType} /> : null}

        {diffs.rows.length === 0 ? (
          <EmptyState
            title={submission.status === "PASSED" ? "无差异" : "暂无差异记录"}
            description={
              submission.status === "PASSED"
                ? "回传文件与原始数据逐条一致。"
                : "当前筛选条件下没有差异。"
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>差异类型</th>
                    <th>键（证件号 / 姓名）</th>
                    <th>字段</th>
                    <th>原始值</th>
                    <th>回传值</th>
                    <th className="num">源行号</th>
                    <th className="num">回传行号</th>
                    <th className="wrap">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className={`badge ${diffTone(row.diff_type)}`}>
                          {DIFF_LABELS[row.diff_type] ?? row.diff_type}
                        </span>
                      </td>
                      <td className="diff-key">{row.diff_key}</td>
                      <td>{row.field_name ?? "—"}</td>
                      <td>{row.original_value ?? "—"}</td>
                      <td style={{ color: "var(--danger)" }}>{row.returned_value ?? "—"}</td>
                      <td className="num muted">{row.source_row_number ?? "—"}</td>
                      <td className="num muted">{row.return_row_number ?? "—"}</td>
                      <td className="wrap">{row.message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={diffs.total}
              pageSize={pageSize}
              makeHref={(next) => makeHref(next, filterType || null)}
            />
          </>
        )}
      </div>
    </div>
  );
}
