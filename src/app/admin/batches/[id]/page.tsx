import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import {
  downloadedOrgCount,
  getAnomalyPage,
  getBatchForUser,
  getBatchOrgs,
  getLatestBatchJob,
  parseStats,
} from "@/lib/services/batch-service";
import { getDatasetPage } from "@/lib/services/dataset-service";
import { DATASET_LABELS, DATASET_TYPES, type DatasetType } from "@/lib/rules/types";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  monthText,
  shortHash,
} from "@/lib/utils/format";
import { ANOMALY_LABELS, anomalyLabel } from "@/lib/utils/labels";
import {
  Callout,
  EmptyState,
  PageHeader,
  Pagination,
  StatCard,
  StatusBadge,
  TabLinks,
} from "@/components/ui";
import {
  IconChevronLeft,
  IconDownload,
  IconReturns,
  IconSearch,
} from "@/components/icons";
import BatchActions from "./BatchActions";
import JobProgressWatcher from "./JobProgressWatcher";

export const dynamic = "force-dynamic";

const ORG_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#64748b"];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminBatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("ADMIN");
  const { id } = await params;
  const search = await searchParams;
  const db = getDb();

  const batch = (() => {
    try {
      return getBatchForUser(db, user, id);
    } catch {
      notFound();
    }
  })();

  const stats = parseStats(batch);
  const orgs = getBatchOrgs(db, id, user);
  const uploader = db
    .prepare("SELECT name FROM users WHERE id = ?")
    .get(batch.uploaded_by) as { name: string } | undefined;
  const job = getLatestBatchJob(db, id);

  const tab = first(search.tab) ?? "overview";
  const typeRaw = first(search.type) ?? "NEW_PERSON";
  const boardType = (DATASET_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as DatasetType)
    : "NEW_PERSON";
  const boardOrgId = first(search.orgId) || null;
  const boardPage = Math.max(1, Number(first(search.page) ?? "1") || 1);
  const boardQ = first(search.q) ?? "";
  const boardSort = first(search.sort) ?? "row";
  const boardDirection = first(search.direction) ?? "asc";
  const anomalyPage = Math.max(1, Number(first(search.anomalyPage) ?? "1") || 1);
  const anomalyCode = first(search.code) ?? "";
  const anomalyQ = first(search.aq) ?? "";

  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const text = first(value);
    if (text) base.set(key, text);
  }
  function makeHref(overrides: Record<string, string | null | undefined>): string {
    const next = new URLSearchParams(base);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return `/admin/batches/${id}${query ? `?${query}` : ""}`;
  }

  const tabs = [
    { key: "overview", label: "总览", href: makeHref({ tab: "overview" }) },
    { key: "anomalies", label: `异常清单${stats.anomalyRows ? ` (${stats.anomalyRows})` : ""}`, href: makeHref({ tab: "anomalies" }) },
    { key: "orgs", label: `省份分布 (${orgs.length})`, href: makeHref({ tab: "orgs" }) },
    { key: "boards", label: "四个看板", href: makeHref({ tab: "boards" }) },
  ];

  const taskCounts = orgs.reduce<Record<string, number>>((acc, org) => {
    const key = org.task_status ?? "NOT_SUBMITTED";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const totalOrgRecords = orgs.reduce((sum, org) => sum + org.record_count, 0);
  const downloaded = downloadedOrgCount(db, id);

  return (
    <div>
      <PageHeader
        title={`${monthText(batch.month)} 批次详情`}
        description={
          <span>
            版本 V{batch.version} · {batch.original_file_name} · 上传人 {uploader?.name ?? "—"}
          </span>
        }
        actions={
          <>
            <Link className="btn btn-secondary" href="/admin">
              <IconChevronLeft width={15} height={15} />
              返回
            </Link>
            {batch.status === "PUBLISHED" ? (
              <Link className="btn btn-secondary" href={`/admin/batches/${id}/returns`}>
                <IconReturns width={15} height={15} />
                回传进度
              </Link>
            ) : null}
            <BatchActions batchId={id} status={batch.status} />
          </>
        }
      />

      {batch.status === "QUEUED" || batch.status === "PROCESSING" ? (
        <div className="card mb-4">
          <div className="card-body">
            <div className="card-title" style={{ marginBottom: 12 }}>
              批次处理中
            </div>
            {job ? (
              <JobProgressWatcher
                jobId={job.id}
                initialStatus={job.status}
                initialProgress={job.progress}
              />
            ) : (
              <div className="muted">正在等待处理任务启动…</div>
            )}
          </div>
        </div>
      ) : null}

      {batch.status === "FAILED" ? (
        <div className="mb-4">
          <Callout tone="danger">
            <strong>批次处理失败：</strong>
            {batch.error_message ?? "未知错误"}。请修正源文件或字段配置后重新上传。
          </Callout>
        </div>
      ) : null}

      {batch.status === "DRAFT" ? (
        <div className="mb-4">
          <Callout tone="warning">
            当前为草稿批次，省负责人不可见。请核对异常清单、省份分布和四个看板后再发布。
            同月再次发布时，旧版本会自动标记为“已替代”。
          </Callout>
        </div>
      ) : null}

      {batch.status === "PUBLISHED" ? (
        <div className="mb-4">
          <Callout tone="success">
            批次已发布（{formatDateTime(batch.published_at)}）。省负责人可查看本人组织数据并下载四
            Sheet 文件；已下载组织 {downloaded} 个。回传通过的组织才进入归集。
          </Callout>
        </div>
      ) : null}

      {batch.status === "SUPERSEDED" || batch.status === "VOIDED" ? (
        <div className="mb-4">
          <Callout tone="warning">
            该批次已{batch.status === "SUPERSEDED" ? "被同月新版本替代" : "作废"}，仅供追溯查看。
          </Callout>
        </div>
      ) : null}

      <TabLinks items={tabs} active={tab} />

      {tab === "overview" ? (
        <div className="stack">
          <div className="stat-grid">
            <StatCard label="源记录数" value={formatNumber(stats.sourceRows)} />
            <StatCard label="有效记录" value={formatNumber(stats.validRows)} tone="primary" hint="应税所得 ≥ 0" />
            <StatCard label="已归属" value={formatNumber(stats.assignedRows)} tone="success" />
            <StatCard
              label="归属异常"
              value={formatNumber(stats.orgUnmappedRows)}
              tone={stats.orgUnmappedRows ? "danger" : undefined}
            />
            <StatCard
              label="负数排除"
              value={formatNumber(stats.negativeRows)}
              tone={stats.negativeRows ? "warning" : undefined}
            />
            <StatCard label="应税所得合计" value={`¥${formatMoney(stats.incomeTotalCents)}`} />
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head">
                <div className="card-title">批次信息</div>
                <StatusBadge status={batch.status} />
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>佣金所属月份</dt>
                  <dd>{monthText(batch.month)}</dd>
                  <dt>批次版本</dt>
                  <dd>V{batch.version}</dd>
                  <dt>源文件</dt>
                  <dd>{batch.original_file_name}</dd>
                  <dt>工作表 / 表头</dt>
                  <dd>
                    {batch.source_sheet ?? "—"} / 第 {batch.header_row ?? "—"} 行
                  </dd>
                  <dt>上传人</dt>
                  <dd>{uploader?.name ?? "—"}</dd>
                  <dt>上传时间</dt>
                  <dd>{formatDateTime(batch.created_at)}</dd>
                  <dt>处理时间</dt>
                  <dd>{formatDateTime(batch.processed_at)}</dd>
                  <dt>发布时间</dt>
                  <dd>{formatDateTime(batch.published_at)}</dd>
                  <dt>批次备注</dt>
                  <dd>{batch.note || "—"}</dd>
                  <dt>文件摘要</dt>
                  <dd className="mono" title={batch.sha256}>
                    {shortHash(batch.sha256)}
                  </dd>
                  <dt>规则版本</dt>
                  <dd>{batch.rule_version}</dd>
                </dl>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div className="card-title">守恒校验</div>
                {stats.conservationOk === false ? (
                  <span className="badge badge-red">未通过</span>
                ) : (
                  <span className="badge badge-green">已通过</span>
                )}
              </div>
              <div className="card-body">
                <Callout tone={stats.conservationOk === false ? "danger" : "success"}>
                  有效记录 {formatNumber(stats.validRows)} = 已归属 {formatNumber(stats.assignedRows)} +
                  归属异常 {formatNumber(stats.orgUnmappedRows)}
                  <br />
                  有效应税所得合计 ¥{formatMoney(stats.incomeTotalCents)}
                </Callout>
                <div className="divider" />
                <dl className="kv">
                  <dt>金额异常</dt>
                  <dd>{formatNumber(stats.invalidIncomeRows)} 条（空值/非数值）</dd>
                  <dt>异常总数</dt>
                  <dd>{formatNumber(stats.anomalyRows)} 条</dd>
                  <dt>覆盖组织</dt>
                  <dd>{orgs.length} 个</dd>
                  <dt>已下载组织</dt>
                  <dd>{downloaded} 个</dd>
                </dl>
                <div className="divider" />
                {batch.status === "PUBLISHED" ? (
                  <div className="progress-legend">
                    <span>
                      <i className="legend-dot" style={{ background: "#10b981" }} />
                      已通过 {taskCounts.PASSED ?? 0}
                    </span>
                    <span>
                      <i className="legend-dot" style={{ background: "#f59e0b" }} />
                      未回传 {taskCounts.NOT_SUBMITTED ?? 0}
                    </span>
                    <span>
                      <i className="legend-dot" style={{ background: "#ef4444" }} />
                      不通过 {(taskCounts.REJECTED ?? 0) + (taskCounts.COMPARE_ERROR ?? 0)}
                    </span>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>
                    发布后生成省负责人回传任务。
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">省份分布与下载</div>
                <div className="card-sub">
                  共 {orgs.length} 个组织、{formatNumber(totalOrgRecords)} 条有效记录。发布后可为每个组织下载四
                  Sheet 文件。
                </div>
              </div>
            </div>
            {orgs.length === 0 ? (
              <EmptyState title="没有已归属数据" description="请检查异常清单中的组织归属问题。" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>组织</th>
                      <th className="num">有效记录</th>
                      <th className="num">应税所得合计</th>
                      <th style={{ minWidth: 160 }}>占比</th>
                      <th>回传状态</th>
                      <th className="num">差异</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((org, index) => {
                      const percent = totalOrgRecords
                        ? Math.round((org.record_count / totalOrgRecords) * 1000) / 10
                        : 0;
                      return (
                        <tr key={org.org_id}>
                          <td className="strong">{org.org_name}</td>
                          <td className="num">{formatNumber(org.record_count)}</td>
                          <td className="num">¥{formatMoney(org.income_cents)}</td>
                          <td>
                            <div className="dist-bar">
                              <span
                                style={{
                                  width: `${percent}%`,
                                  background: ORG_COLORS[index % ORG_COLORS.length],
                                }}
                              />
                            </div>
                            <span className="muted" style={{ fontSize: 11.5 }}>
                              {percent}%
                            </span>
                          </td>
                          <td>
                            {batch.status === "PUBLISHED" ? (
                              <StatusBadge status={org.task_status ?? "NOT_SUBMITTED"} />
                            ) : (
                              <span className="muted">发布后开启</span>
                            )}
                          </td>
                          <td className="num">{org.diff_count ?? "—"}</td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              <Link
                                className="btn btn-secondary btn-sm"
                                href={makeHref({
                                  tab: "boards",
                                  type: "LABOR_INCOME",
                                  orgId: org.org_id,
                                  page: null,
                                  q: null,
                                })}
                              >
                                看板
                              </Link>
                              {batch.status === "PUBLISHED" ? (
                                <a
                                  className="btn btn-primary btn-sm"
                                  href={`/api/batches/${id}/organizations/${org.org_id}/export`}
                                >
                                  <IconDownload width={14} height={14} />
                                  下载
                                </a>
                              ) : (
                                <span className="btn btn-secondary btn-sm" style={{ opacity: 0.45 }}>
                                  <IconDownload width={14} height={14} />
                                  下载
                                </span>
                              )}
                            </div>
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
      ) : null}

      {tab === "anomalies" ? (
        <AnomaliesTab
          db={db}
          batchId={id}
          page={anomalyPage}
          code={anomalyCode}
          q={anomalyQ}
          makeHref={makeHref}
        />
      ) : null}

      {tab === "orgs" ? (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">省份分布</div>
              <div className="card-sub">只统计已成功归属且应税所得 ≥ 0 的记录。</div>
            </div>
          </div>
          {orgs.length === 0 ? (
            <EmptyState title="没有已归属数据" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>组织</th>
                    <th className="num">有效记录</th>
                    <th className="num">应税所得合计</th>
                    <th>回传任务</th>
                    <th>最新回传</th>
                    <th className="num">差异数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr key={org.org_id}>
                      <td className="strong">{org.org_name}</td>
                      <td className="num">{formatNumber(org.record_count)}</td>
                      <td className="num">¥{formatMoney(org.income_cents)}</td>
                      <td>
                        <StatusBadge status={org.task_status ?? "NOT_SUBMITTED"} />
                      </td>
                      <td>
                        {org.submission_status ? (
                          <StatusBadge status={org.submission_status} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="num">{org.diff_count ?? "—"}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <Link
                            className="btn btn-secondary btn-sm"
                            href={makeHref({ tab: "boards", type: "LABOR_INCOME", orgId: org.org_id })}
                          >
                            查看看板
                          </Link>
                          {batch.status === "PUBLISHED" ? (
                            <a
                              className="btn btn-primary btn-sm"
                              href={`/api/batches/${id}/organizations/${org.org_id}/export`}
                            >
                              <IconDownload width={14} height={14} />
                              下载
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "boards" ? (
        <BoardsTab
          db={db}
          user={user}
          batch={batch}
          orgs={orgs}
          type={boardType}
          orgId={boardOrgId}
          page={boardPage}
          q={boardQ}
          sort={boardSort}
          direction={boardDirection}
          makeHref={makeHref}
        />
      ) : null}
    </div>
  );
}

async function AnomaliesTab({
  db,
  batchId,
  page,
  code,
  q,
  makeHref,
}: {
  db: ReturnType<typeof getDb>;
  batchId: string;
  page: number;
  code: string;
  q: string;
  makeHref: (overrides: Record<string, string | null | undefined>) => string;
}) {
  const { rows, total } = getAnomalyPage(db, batchId, {
    page,
    pageSize: 50,
    code: code || null,
    q: q || null,
  });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">异常清单</div>
          <div className="card-sub">
            包含负数排除、金额为空/非数值、入职月份无法识别、组织归属异常、身份字段缺失和疑似重复。
          </div>
        </div>
        <span className="badge badge-gray">共 {formatNumber(total)} 条</span>
      </div>
      <form method="get" className="filter-bar">
        <input type="hidden" name="tab" value="anomalies" />
        <select className="select input-sm" name="code" defaultValue={code}>
          <option value="">全部异常类型</option>
          {Object.entries(ANOMALY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="search">
          <IconSearch />
          <input
            className="input input-sm"
            name="aq"
            defaultValue={q}
            placeholder="姓名 / 省份源值 / 行号"
          />
        </div>
        <button className="btn btn-secondary btn-sm" type="submit">
          筛选
        </button>
        <Link className="btn btn-ghost btn-sm" href={makeHref({ tab: "anomalies", code: null, aq: null, anomalyPage: null })}>
          重置
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="没有异常记录" description="当前筛选条件下没有需要处理的记录。" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">行号</th>
                  <th>姓名</th>
                  <th>证件号</th>
                  <th>省份源值</th>
                  <th className="num">应税所得</th>
                  <th>入职月份</th>
                  <th>状态</th>
                  <th className="wrap">异常原因</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const codes = JSON.parse(row.anomaly_codes_json) as string[];
                  return (
                    <tr key={row.id}>
                      <td className="num muted">{row.row_number}</td>
                      <td className="strong">{row.name || "—"}</td>
                      <td className="mono">{row.id_mask || "—"}</td>
                      <td>{row.org_raw || "—"}</td>
                      <td className="num">{row.taxable_income_text || "—"}</td>
                      <td>{row.entry_month_raw || "—"}</td>
                      <td>
                        <StatusBadge status={row.valid_status} />
                      </td>
                      <td className="wrap">
                        <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                          {codes.length ? (
                            codes.map((item) => (
                              <span key={item} className="badge badge-amber">
                                {anomalyLabel(item)}
                              </span>
                            ))
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={total}
            pageSize={50}
            makeHref={(next) => makeHref({ tab: "anomalies", anomalyPage: String(next) })}
          />
        </>
      )}
    </div>
  );
}

function BoardsTab({
  db,
  user,
  batch,
  orgs,
  type,
  orgId,
  page,
  q,
  sort,
  direction,
  makeHref,
}: {
  db: ReturnType<typeof getDb>;
  user: Awaited<ReturnType<typeof requirePageUser>>;
  batch: NonNullable<ReturnType<typeof getBatchForUser>>;
  orgs: ReturnType<typeof getBatchOrgs>;
  type: DatasetType;
  orgId: string | null;
  page: number;
  q: string;
  sort: string;
  direction: string;
  makeHref: (overrides: Record<string, string | null | undefined>) => string;
}) {
  const data = getDatasetPage(db, user, batch, type, {
    orgId,
    page,
    pageSize: 25,
    q: q || null,
    sort,
    direction,
  });

  const selectedOrg = orgs.find((org) => org.org_id === orgId);
  const recordCount = selectedOrg
    ? selectedOrg.record_count
    : orgs.reduce((sum, org) => sum + org.record_count, 0);
  const income = selectedOrg
    ? selectedOrg.income_cents
    : orgs.reduce((sum, org) => sum + org.income_cents, 0);

  const typeTabs = DATASET_TYPES.map((item) => ({
    key: item,
    label: DATASET_LABELS[item],
    href: makeHref({ tab: "boards", type: item, page: null, q: null }),
  }));

  return (
    <div className="stack">
      <TabLinks items={typeTabs} active={type} />

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">
              {DATASET_LABELS[type]} · {selectedOrg?.org_name ?? "全国汇总"}
            </div>
            <div className="card-sub">
              {monthText(batch.month)} · V{batch.version} · 记录 {formatNumber(recordCount)} 条 ·
              应税所得合计 ¥{formatMoney(income)}
            </div>
          </div>
          <span className="badge badge-gray">
            共 {formatNumber(data.total)} 条{data.includesOrgColumn ? "（含组织列）" : ""}
          </span>
        </div>

        <div className="filter-bar">
          <form method="get" className="row" style={{ gap: 8 }}>
            <input type="hidden" name="tab" value="boards" />
            <input type="hidden" name="type" value={type} />
            <select className="select input-sm" name="orgId" defaultValue={orgId ?? ""}>
              <option value="">全国汇总</option>
              {orgs.map((org) => (
                <option key={org.org_id} value={org.org_id}>
                  {org.org_name}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary btn-sm" type="submit">
              切换组织
            </button>
          </form>

          <form method="get" className="row" style={{ gap: 8 }}>
            <input type="hidden" name="tab" value="boards" />
            <input type="hidden" name="type" value={type} />
            {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
            <div className="search">
              <IconSearch />
              <input
                className="input input-sm"
                name="q"
                defaultValue={q}
                placeholder="姓名或完整证件号"
              />
            </div>
            <select className="select input-sm" name="sort" defaultValue={sort}>
              <option value="row">按源表行号</option>
              <option value="name">按姓名</option>
              <option value="income">按应税所得</option>
            </select>
            <select className="select input-sm" name="direction" defaultValue={direction}>
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
            <button className="btn btn-secondary btn-sm" type="submit">
              查询
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {data.headers.map((header, index) => (
                  <th key={`${header}-${index}`} className={header.includes("收入") || header.includes("所得") ? "num" : ""}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, data.headers.length)}>
                    <div style={{ padding: "28px 0", textAlign: "center", color: "var(--muted)" }}>
                      本期无数据
                    </div>
                  </td>
                </tr>
              ) : (
                data.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={
                          typeof cell === "number" && data.headers[cellIndex]?.includes("收入")
                            ? "num"
                            : ""
                        }
                      >
                        {cell === null || cell === undefined ? "" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          makeHref={(next) => makeHref({ tab: "boards", page: String(next) })}
        />
      </div>
    </div>
  );
}
