import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import { getBatchForUser, getBatchOrgs } from "@/lib/services/batch-service";
import { getDatasetPage } from "@/lib/services/dataset-service";
import { DATASET_LABELS, DATASET_TYPES, type DatasetType } from "@/lib/rules/types";
import { formatMoney, formatNumber, monthText } from "@/lib/utils/format";
import {
  Callout,
  PageHeader,
  Pagination,
  StatusBadge,
  TabLinks,
} from "@/components/ui";
import { IconChevronLeft, IconDownload, IconReturns, IconSearch } from "@/components/icons";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProvinceBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("PROVINCE");
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

  const orgs = getBatchOrgs(db, id, user);
  if (!orgs.length) notFound();

  const orgId = first(search.orgId) || orgs[0].org_id;
  const selectedOrg = orgs.find((org) => org.org_id === orgId) ?? orgs[0];
  const typeRaw = first(search.type) ?? "NEW_PERSON";
  const type = (DATASET_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as DatasetType)
    : "NEW_PERSON";
  const page = Math.max(1, Number(first(search.page) ?? "1") || 1);
  const q = first(search.q) ?? "";
  const sort = first(search.sort) ?? "row";
  const direction = first(search.direction) ?? "asc";

  const data = getDatasetPage(db, user, batch, type, {
    orgId: selectedOrg.org_id,
    page,
    pageSize: 25,
    q: q || null,
    sort,
    direction,
  });

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
    return `/province/batches/${id}${query ? `?${query}` : ""}`;
  }

  const tabs = DATASET_TYPES.map((item) => ({
    key: item,
    label: DATASET_LABELS[item],
    href: makeHref({ tab: "boards", type: item, page: null, q: null }),
  }));

  return (
    <div>
      <PageHeader
        title={`${monthText(batch.month)} · 我的申报数据`}
        description={`批次 V${batch.version} · ${selectedOrg.org_name} · 数据已按组织权限隔离`}
        actions={
          <>
            <Link className="btn btn-secondary" href="/province">
              <IconChevronLeft width={15} height={15} />
              返回
            </Link>
            <Link
              className="btn btn-secondary"
              href={`/province/returns?batchId=${batch.id}&orgId=${selectedOrg.org_id}`}
            >
              <IconReturns width={15} height={15} />
              回传
            </Link>
            <a
              className="btn btn-primary"
              href={`/api/batches/${batch.id}/organizations/${selectedOrg.org_id}/export`}
            >
              <IconDownload width={16} height={16} />
              下载四 Sheet
            </a>
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">当前组织</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {selectedOrg.org_name}
          </div>
          <div className="stat-hint">
            回传状态 <StatusBadge status={selectedOrg.task_status ?? "NOT_SUBMITTED"} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">有效记录</div>
          <div className="stat-value">{formatNumber(selectedOrg.record_count)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">应税所得合计</div>
          <div className="stat-value">¥{formatMoney(selectedOrg.income_cents)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">最新差异数</div>
          <div className="stat-value">{selectedOrg.diff_count ?? "—"}</div>
        </div>
      </div>

      <div className="mb-4">
        <Callout tone="info">
          页面中的证照号码默认脱敏展示。下载的 Excel 使用文本格式保存完整号码，请勿通过聊天工具转发或在非受控设备留存。
        </Callout>
      </div>

      <TabLinks items={tabs} active={type} />

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">
              {DATASET_LABELS[type]} · {selectedOrg.org_name}
            </div>
            <div className="card-sub">
              {monthText(batch.month)} · V{batch.version} · 共 {formatNumber(data.total)} 条
            </div>
          </div>
          {orgs.length > 1 ? (
            <form method="get" className="row" style={{ gap: 8 }}>
              <input type="hidden" name="tab" value="boards" />
              <input type="hidden" name="type" value={type} />
              <select className="select input-sm" name="orgId" defaultValue={selectedOrg.org_id}>
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
          ) : null}
        </div>

        <form method="get" className="filter-bar">
          <input type="hidden" name="tab" value="boards" />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="orgId" value={selectedOrg.org_id} />
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

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {data.headers.map((header, index) => (
                  <th key={`${header}-${index}`}>{header}</th>
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
                      <td key={cellIndex}>
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
