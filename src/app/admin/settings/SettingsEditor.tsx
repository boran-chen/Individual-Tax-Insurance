"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FIELD_DEFS, type FieldKey } from "@/lib/config/fields";
import type { ReturnTemplate } from "@/lib/config/return-template";
import { Callout } from "@/components/ui";

export default function SettingsEditor({
  initialAliases,
  initialTemplate,
  rulesVersion,
}: {
  initialAliases: Partial<Record<FieldKey, string[]>>;
  initialTemplate: ReturnTemplate;
  rulesVersion: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"fields" | "return">("fields");
  const [aliasText, setAliasText] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const def of FIELD_DEFS) {
      initial[def.key] = (initialAliases[def.key] ?? []).join(", ");
    }
    return initial;
  });
  const [templateText, setTemplateText] = useState(() => JSON.stringify(initialTemplate, null, 2));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(key: "field_aliases" | "return_template", value: unknown) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setMessage("配置已保存。新配置将应用于之后的上传与回传。");
      router.refresh();
    } catch {
      setError("网络异常，保存失败");
    } finally {
      setSaving(false);
    }
  }

  function saveAliases() {
    const value: Partial<Record<FieldKey, string[]>> = {};
    for (const def of FIELD_DEFS) {
      const aliases = (aliasText[def.key] ?? "")
        .split(/[,，、\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (aliases.length) value[def.key] = aliases;
    }
    void save("field_aliases", value);
  }

  function saveTemplate() {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(templateText);
    } catch {
      setError("回传模板不是合法 JSON");
      return;
    }
    void save("return_template", parsed);
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">配置项</div>
          <div className="card-sub">
            字段别名用于识别源表表头；回传模板用于解析省负责人回传文件。
          </div>
        </div>
        <span className="badge badge-gray">规则版本 {rulesVersion}</span>
      </div>

      <div style={{ padding: "0 20px" }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`tab ${tab === "fields" ? "active" : ""}`}
            onClick={() => setTab("fields")}
            style={{ background: "none", borderTop: 0, borderLeft: 0, borderRight: 0 }}
          >
            字段别名
          </button>
          <button
            type="button"
            className={`tab ${tab === "return" ? "active" : ""}`}
            onClick={() => setTab("return")}
            style={{ background: "none", borderTop: 0, borderLeft: 0, borderRight: 0 }}
          >
            回传模板
          </button>
        </div>
      </div>

      <div className="card-body">
        {message ? (
          <div style={{ marginBottom: 14 }}>
            <Callout tone="success">{message}</Callout>
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        ) : null}

        {tab === "fields" ? (
          <>
            <Callout tone="info">
              自定义别名会追加到系统默认别名之后，不会替换默认值。用逗号分隔多个别名；留空表示只使用默认别名。
              修改后重新上传批次即可生效。
            </Callout>
            <div className="form-grid mt-4">
              {FIELD_DEFS.map((def) => (
                <div className="field" key={def.key}>
                  <label>
                    {def.label}
                    {def.required ? " *" : "（可选）"}
                  </label>
                  <input
                    className="input"
                    value={aliasText[def.key] ?? ""}
                    placeholder={`默认：${def.aliases.join("、")}`}
                    onChange={(event) =>
                      setAliasText((current) => ({ ...current, [def.key]: event.target.value }))
                    }
                  />
                  <span className="hint">默认别名：{def.aliases.join("、")}</span>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <button className="btn btn-primary" type="button" onClick={saveAliases} disabled={saving}>
                {saving ? "保存中…" : "保存字段别名"}
              </button>
            </div>
          </>
        ) : (
          <>
            <Callout tone="info">
              回传默认读取“3劳动报酬收入”工作表，并按姓名、证照号码、收入列比对。若省负责人回传的是扣缴端导出的其他模板，
              在这里调整 sheetNames 和 columns 别名即可，无需改代码。
            </Callout>
            <div className="field mt-4">
              <label>回传模板 JSON</label>
              <textarea
                className="textarea"
                style={{ minHeight: 360 }}
                value={templateText}
                onChange={(event) => setTemplateText(event.target.value)}
                spellCheck={false}
              />
              <span className="hint">
                必填列：columns.name、columns.idNumber、columns.income；toleranceCents 为金额容差（分）。
              </span>
            </div>
            <div className="mt-4">
              <button className="btn btn-primary" type="button" onClick={saveTemplate} disabled={saving}>
                {saving ? "保存中…" : "保存回传模板"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
