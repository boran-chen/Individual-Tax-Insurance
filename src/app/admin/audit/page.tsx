import Link from "next/link";
import { getDb, jsonParse } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import { formatDateTime } from "@/lib/utils/format";
import { JOB_ACTION_LABELS } from "@/lib/utils/labels";
import {
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
} from "@/components/ui";
import { IconSearch } from "@/components/icons";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageUser("ADMIN");
  const search = await searchParams;
  const db = getDb();

  const action = first(search.action) ?? "";
  const userId = first(search.userId) ?? "";
  const orgId = first(search.orgId) ?? "";
  const from = first(search.from) ?? "";
  const to = first(search.to) ?? "";
  const month = first(search.month) ?? "";
  const page = Math.max(1, Number(first(search.page) ?? "1") || 1);
  const pageSize = 50;

  const conditions = ["1 = 1"];
  const params: Array<string | number> = [];
  if (action) {
    conditions.push("a.action = ?");
    params.push(action);
  }
  if (userId) {
    conditions.push("a.user_id = ?");
    params.push(userId);
  }
  if (orgId) {
    conditions.push("a.org_id = ?");
    params.push(orgId);
  }
  if (from) {
    conditions.push("a.created_at >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("a.created_at <= ?");
    params.push(`${to}T23:59:59.999Z`);
  }
  if (month) {
    conditions.push("json_extract(a.context_json, '$.month') = ?");
    params.push(month);
  }

  const where = conditions.join(" AND ");
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${where}`)
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `SELECT a.*, u.name AS user_name
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE ${where}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as unknown as Array<{
    id: string;
    user_id: string | null;
    user_name: string | null;
    action: string;
    object_type: string | null;
    object_id: string | null;
    org_id: string | null;
    result: string;
    context_json: string;
    ip: string | null;
    created_at: string;
  }>;

  const users = db.prepare("SELECT id, name FROM users ORDER BY name").all() as Array<{
    id: string;
    name: string;
  }>;
  const organizations = db
    .prepare("SELECT id, name FROM organizations ORDER BY sort_order")
    .all() as Array<{ id: string; name: string }>;
  const actions = Object.entries(JOB_ACTION_LABELS);

  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const text = first(value);
    if (text) base.set(key, text);
  }
  function makeHref(nextPage: number): string {
    const next = new URLSearchParams(base);
    next.set("page", String(nextPage));
    return `/admin/audit?${next.toString()}`;
  }

  return (
    <div>
      <PageHeader
        title="审计日志"
        description="上传、发布、作废、下载、回传、比对与权限变更全程留痕；日志不记录完整证照号码。"
      />

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">操作记录</div>
            <div className="card-sub">共 {totalRow.total.toLocaleString("zh-CN")} 条</div>
          </div>
        </div>

        <form method="get" className="filter-bar">
          <select className="select input-sm" name="action" defaultValue={action}>
            <option value="">全部动作</option>
            {actions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select className="select input-sm" name="userId" defaultValue={userId}>
            <option value="">全部用户</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <select className="select input-sm" name="orgId" defaultValue={orgId}>
            <option value="">全部组织</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input className="input input-sm" type="month" name="month" defaultValue={month} />
          <input className="input input-sm" type="date" name="from" defaultValue={from} />
          <span className="muted">至</span>
          <input className="input input-sm" type="date" name="to" defaultValue={to} />
          <button className="btn btn-secondary btn-sm" type="submit">
            <IconSearch width={14} height={14} />
            查询
          </button>
          <Link className="btn btn-ghost btn-sm" href="/admin/audit">
            重置
          </Link>
        </form>

        {rows.length === 0 ? (
          <EmptyState title="没有符合条件的日志" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>用户</th>
                    <th>动作</th>
                    <th>对象</th>
                    <th>组织</th>
                    <th>结果</th>
                    <th>IP</th>
                    <th className="wrap">上下文</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const context = jsonParse<Record<string, unknown>>(row.context_json, {});
                    const contextText = JSON.stringify(context);
                    return (
                      <tr key={row.id}>
                        <td className="muted nowrap">{formatDateTime(row.created_at)}</td>
                        <td>{row.user_name ?? "—"}</td>
                        <td className="strong">{JOB_ACTION_LABELS[row.action] ?? row.action}</td>
                        <td className="mono muted">
                          {row.object_type ?? "—"}
                          {row.object_id ? ` / ${row.object_id.slice(0, 10)}…` : ""}
                        </td>
                        <td>{organizations.find((org) => org.id === row.org_id)?.name ?? row.org_id ?? "—"}</td>
                        <td>
                          <StatusBadge status={row.result} />
                        </td>
                        <td className="mono muted">{row.ip ?? "—"}</td>
                        <td className="wrap" style={{ maxWidth: 360 }}>
                          <span className="mono" title={contextText}>
                            {contextText.length > 90 ? `${contextText.slice(0, 90)}…` : contextText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={Number(totalRow.total)}
              pageSize={pageSize}
              makeHref={makeHref}
            />
          </>
        )}
      </div>
    </div>
  );
}
