"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/utils/format";
import { IconPlus, IconSearch } from "@/components/icons";
import { Callout, StatusBadge } from "@/components/ui";

type MappingItem = {
  id: string;
  sourceValue: string;
  orgId: string;
  orgName: string;
  shortName: string;
  active: boolean;
  updatedAt: string;
};

type Org = { id: string; name: string; short_name: string };

export default function MappingsManager({
  initialMappings,
  organizations,
}: {
  initialMappings: MappingItem[];
  organizations: Org[];
}) {
  const router = useRouter();
  const mappings = initialMappings;
  const [query, setQuery] = useState("");
  const [sourceValue, setSourceValue] = useState("");
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return mappings;
    return mappings.filter(
      (item) => item.sourceValue.includes(q) || item.orgName.includes(q) || item.shortName.includes(q),
    );
  }, [mappings, query]);

  async function addMapping() {
    setError(null);
    if (!sourceValue.trim()) {
      setError("请输入省份源值");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceValue, orgId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setSourceValue("");
      router.refresh();
    } catch {
      setError("网络异常，保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function patchMapping(id: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/mappings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "更新失败");
        return;
      }
      router.refresh();
    } catch {
      setError("网络异常，更新失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Callout tone="info">
        映射表用于精确匹配源值（忽略空格和全半角差异）。未命中的记录会进入“组织归属异常”清单，
        不会进入任何省份数据。新增省份写法后，需要重新上传或重新处理批次才能生效。
      </Callout>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">新增映射</div>
            <div className="card-sub">例如源值“江苏”映射到“江苏省分公司”。</div>
          </div>
        </div>
        <div className="card-body">
          {error ? (
            <div className="login-error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          ) : null}
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="省份源值，例如：江苏"
              value={sourceValue}
              onChange={(event) => setSourceValue(event.target.value)}
            />
            <select
              className="select"
              style={{ maxWidth: 260 }}
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="button" onClick={addMapping} disabled={busy}>
              <IconPlus width={16} height={16} />
              新增
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">映射列表</div>
            <div className="card-sub">共 {mappings.length} 条，其中启用 {mappings.filter((item) => item.active).length} 条。</div>
          </div>
          <div className="search">
            <IconSearch />
            <input
              className="input input-sm"
              placeholder="搜索源值或组织"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>省份源值</th>
                <th>映射组织</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="mono strong">{item.sourceValue}</td>
                  <td>
                    <select
                      className="select input-sm"
                      value={item.orgId}
                      disabled={busy}
                      onChange={(event) => void patchMapping(item.id, { orgId: event.target.value })}
                    >
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <StatusBadge status={item.active ? "ACTIVE" : "DISABLED"} />
                  </td>
                  <td className="muted">{formatDateTime(item.updatedAt)}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() => void patchMapping(item.id, { active: !item.active })}
                    >
                      {item.active ? "停用" : "启用"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: 28 }}>
            没有匹配的映射
          </div>
        ) : null}
      </div>
    </div>
  );
}
