import Link from "next/link";
import type { ReactNode } from "react";
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconInfo,
} from "./icons";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {description ? <div className="page-desc">{description}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const longValue =
    (typeof value === "string" && value.startsWith("¥")) ||
    (typeof value === "string" && value.length > 9);

  return (
    <div className={`stat ${tone ? `tone-${tone}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={longValue ? { fontSize: 20 } : undefined}>
        {value}
      </div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "sky";

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: "排队中", tone: "gray" },
  PROCESSING: { label: "处理中", tone: "blue" },
  DRAFT: { label: "草稿", tone: "amber" },
  PUBLISHED: { label: "已发布", tone: "green" },
  SUPERSEDED: { label: "已替代", tone: "gray" },
  VOIDED: { label: "已作废", tone: "red" },
  FAILED: { label: "失败", tone: "red" },
  NOT_SUBMITTED: { label: "未回传", tone: "gray" },
  PENDING: { label: "待比对", tone: "sky" },
  PENDING_COMPARE: { label: "待比对", tone: "sky" },
  COMPARING: { label: "比对中", tone: "blue" },
  PASSED: { label: "已通过", tone: "green" },
  REJECTED: { label: "不通过", tone: "red" },
  COMPARE_ERROR: { label: "比对异常", tone: "red" },
  PARSE_ERROR: { label: "解析失败", tone: "red" },
  ACTIVE: { label: "启用", tone: "green" },
  DISABLED: { label: "停用", tone: "gray" },
  EXCLUDED: { label: "未归集", tone: "gray" },
  SUCCEEDED: { label: "已完成", tone: "green" },
  RUNNING: { label: "处理中", tone: "blue" },
  SUCCESS: { label: "成功", tone: "green" },
  FAILURE: { label: "失败", tone: "red" },
  VALID: { label: "已归属", tone: "green" },
  ORG_UNMAPPED: { label: "归属异常", tone: "red" },
  NEGATIVE: { label: "负数排除", tone: "amber" },
  INVALID_INCOME: { label: "金额异常", tone: "red" },
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const item = STATUS_MAP[status] ?? { label: status, tone: "gray" as Tone };
  return (
    <span className={`badge badge-${item.tone}`}>
      <span className="dot" />
      {label ?? item.label}
    </span>
  );
}

export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  const Icon = tone === "success" ? IconCheck : tone === "info" ? IconInfo : IconAlert;
  return (
    <div className={`callout callout-${tone}`}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({
  title = "暂无数据",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <IconFile width={22} height={22} />
      </div>
      <div className="empty-title">{title}</div>
      {description ? <div className="empty-desc">{description}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

export function TabLinks({
  items,
  active,
}: {
  items: Array<{ key: string; label: ReactNode; href: string }>;
  active: string;
}) {
  return (
    <div className="tabs">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`tab ${active === item.key ? "active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  makeHref,
}: {
  page: number;
  total: number;
  pageSize: number;
  makeHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const pages: number[] = [];

  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  for (let index = start; index <= end; index += 1) pages.push(index);

  return (
    <div className="table-footer">
      <div>
        共 <strong style={{ color: "var(--text)" }}>{total.toLocaleString("zh-CN")}</strong> 条 ·
        第 {current} / {totalPages} 页
      </div>
      {totalPages > 1 ? (
        <div className="row" style={{ gap: 4 }}>
          {current > 1 ? (
            <Link className="btn btn-secondary btn-sm" href={makeHref(current - 1)}>
              <IconChevronLeft width={14} height={14} />
              上一页
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm" style={{ opacity: 0.45 }}>
              <IconChevronLeft width={14} height={14} />
              上一页
            </span>
          )}

          {start > 1 ? <span className="muted" style={{ padding: "0 4px" }}>…</span> : null}

          {pages.map((item) => (
            <Link
              key={item}
              href={makeHref(item)}
              className={`btn btn-sm ${item === current ? "btn-primary" : "btn-secondary"}`}
              style={{ minWidth: 32 }}
            >
              {item}
            </Link>
          ))}

          {end < totalPages ? <span className="muted" style={{ padding: "0 4px" }}>…</span> : null}

          {current < totalPages ? (
            <Link className="btn btn-secondary btn-sm" href={makeHref(current + 1)}>
              下一页
              <IconChevronRight width={14} height={14} />
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm" style={{ opacity: 0.45 }}>
              下一页
              <IconChevronRight width={14} height={14} />
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${clamped}%` }} />
    </div>
  );
}
