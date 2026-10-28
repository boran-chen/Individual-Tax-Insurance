import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/current-user";
import {
  getBatchOrgs,
  listBatches,
  parseStats,
} from "@/lib/services/batch-service";
import { formatDateTime, formatMoney, formatNumber, monthText } from "@/lib/utils/format";
import {
  Callout,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { IconDownload, IconReturns } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function ProvinceHomePage() {
  const user = await requirePageUser("PROVINCE");
  const db = getDb();

  const batches = listBatches(db, user, {});
  const cards = batches.map((batch) => ({
    batch,
    stats: parseStats(batch),
    orgs: getBatchOrgs(db, batch.id, user),
  }));

  const allOrgs = cards.flatMap((card) => card.orgs);
  const passed = allOrgs.filter((org) => org.task_status === "PASSED").length;
  const rejected = allOrgs.filter(
    (org) => org.task_status === "REJECTED" || org.task_status === "COMPARE_ERROR",
  ).length;
  const notSubmitted = allOrgs.filter(
    (org) => !org.task_status || org.task_status === "NOT_SUBMITTED",
  ).length;

  return (
    <div>
      <PageHeader
        title="我的批次"
        description="这里只显示您负责组织的已发布批次。下载四 Sheet 文件，加工后回传，系统会自动与原始数据比对。"
      />

      <div className="stat-grid">
        <StatCard label="可下载批次" value={formatNumber(batches.length)} />
        <StatCard label="我的组织数" value={formatNumber(new Set(allOrgs.map((org) => org.org_id)).size)} />
        <StatCard label="已通过" value={formatNumber(passed)} tone="success" />
        <StatCard
          label="不通过"
          value={formatNumber(rejected)}
          tone={rejected ? "danger" : undefined}
        />
        <StatCard
          label="待回传"
          value={formatNumber(notSubmitted)}
          tone={notSubmitted ? "warning" : undefined}
        />
        <StatCard
          label="合计有效记录"
          value={formatNumber(allOrgs.reduce((sum, org) => sum + org.record_count, 0))}
        />
      </div>

      {cards.length === 0 ? (
        <div className="card">
          <EmptyState
            title="暂无可查看的批次"
            description="集团管理员发布批次后，您负责组织的数据会出现在这里。"
          />
        </div>
      ) : (
        <div className="stack">
          <Callout tone="info">
            下载的 Excel 包含四个 Sheet：新增人员信息导入、转非、劳动报酬收入、汇总。请勿修改证照号码格式；
            回传时系统会按“证件号码 + 姓名 + 收入”逐条与原始数据比对，任何差异都会导致不通过。
          </Callout>

          {cards.map(({ batch, stats, orgs }) => (
            <div className="card" key={batch.id}>
              <div className="card-head">
                <div>
                  <div className="card-title">
                    {monthText(batch.month)}
                    <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                      V{batch.version}
                    </span>
                  </div>
                  <div className="card-sub">
                    发布 {formatDateTime(batch.published_at)} · 本批次有效记录{" "}
                    {formatNumber(stats.validRows)} 条 · 应税所得合计 ¥
                    {formatMoney(stats.incomeTotalCents)}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Link className="btn btn-secondary btn-sm" href={`/province/batches/${batch.id}`}>
                    查看四个看板
                  </Link>
                  <Link
                    className="btn btn-primary btn-sm"
                    href={`/province/returns?batchId=${batch.id}`}
                  >
                    <IconReturns width={14} height={14} />
                    去回传
                  </Link>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>我的组织</th>
                      <th className="num">有效记录</th>
                      <th className="num">应税所得合计</th>
                      <th>回传状态</th>
                      <th className="num">差异</th>
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
                        <td className="num">{org.diff_count ?? "—"}</td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <a
                              className="btn btn-primary btn-sm"
                              href={`/api/batches/${batch.id}/organizations/${org.org_id}/export`}
                            >
                              <IconDownload width={14} height={14} />
                              下载申报数据
                            </a>
                            <Link
                              className="btn btn-secondary btn-sm"
                              href={`/province/returns?batchId=${batch.id}&orgId=${org.org_id}`}
                            >
                              回传 / 查看结果
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
