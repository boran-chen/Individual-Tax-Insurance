"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SheetPreview, WorkbookPreview } from "@/lib/excel/reader";
import { FIELD_DEFS, type FieldKey } from "@/lib/config/fields";
import { formatFileSize } from "@/lib/utils/format";
import {
  IconAlert,
  IconCheck,
  IconFile,
  IconUpload,
  IconX,
} from "@/components/icons";
import { Callout, ProgressBar } from "@/components/ui";

type PreviewResponse = {
  uploadId: string;
  fileName: string;
  size: number;
  sha256: string;
  suggestedMonth: string | null;
  preview: WorkbookPreview;
};

type JobResponse = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress: number;
  errorMessage: string | null;
  objectId: string;
};

const STEPS = [
  { number: 1, label: "选择佣金总表" },
  { number: 2, label: "确认月份与表头" },
  { number: 3, label: "校验并生成" },
];

export default function UploadWizard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [month, setMonth] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobResponse | null>(null);

  const sheet: SheetPreview | undefined = useMemo(
    () => preview?.preview.sheets.find((item) => item.name === selectedSheetName),
    [preview, selectedSheetName],
  );

  useEffect(() => {
    if (!job) return;
    if (job.status === "SUCCEEDED") {
      if (job.objectId) router.push(`/admin/batches/${job.objectId}`);
      return;
    }
    if (job.status === "FAILED") {
      setError(job.errorMessage ?? "处理失败，请检查文件后重试");
      setSubmitting(false);
      return;
    }

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        const data = (await response.json()) as JobResponse & { error?: string };
        if (!response.ok) return;
        setJob(data);
      } catch {
        // 轮询失败时等待下一次
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [job, router]);

  function resetFile() {
    setFile(null);
    setPreview(null);
    setSelectedSheetName("");
    setMonth("");
    setStep(1);
    setError(null);
    setJob(null);
    setUploadPercent(0);
  }

  function pickSheet(next: WorkbookPreview, preferred?: string | null) {
    const validSheets = next.sheets.filter((item) => item.headerRow !== null);
    const candidate =
      validSheets.find((item) => item.name === preferred) ??
      validSheets[0] ??
      next.sheets[0];
    setSelectedSheetName(candidate?.name ?? "");
  }

  async function uploadFile(nextFile: File) {
    setError(null);
    setFile(nextFile);
    setPreview(null);
    setUploading(true);
    setUploadPercent(0);
    setStep(1);

    try {
      const data = await new Promise<PreviewResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `/api/uploads/preview?fileName=${encodeURIComponent(nextFile.name)}`,
        );
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadPercent(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(xhr.responseText);
          } catch {
            parsed = null;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(parsed as PreviewResponse);
          } else {
            reject(
              new Error(
                (parsed as { error?: string } | null)?.error ?? "上传失败，请稍后重试",
              ),
            );
          }
        };
        xhr.onerror = () => reject(new Error("网络异常，上传失败"));
        xhr.send(nextFile);
      });

      setPreview(data);
      setMonth(data.suggestedMonth ?? "");
      pickSheet(data.preview, data.preview.suggestedSheet);
      setStep(2);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void uploadFile(dropped);
  }

  const missingRequired = sheet?.missingRequired ?? [];
  const duplicates = sheet?.duplicatedHeaders ?? [];
  const conflicts = sheet?.conflictingFields ?? [];
  const canGenerate =
    Boolean(preview) &&
    Boolean(sheet?.headerRow) &&
    missingRequired.length === 0 &&
    duplicates.length === 0 &&
    conflicts.length === 0 &&
    Boolean(month) &&
    !submitting;

  async function generate() {
    if (!preview || !canGenerate) return;
    setError(null);
    setSubmitting(true);
    setStep(3);
    try {
      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: preview.uploadId,
          month,
          sheetName: sheet?.name,
          note,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        batchId?: string;
        jobId?: string;
      };
      if (!response.ok || !data.jobId) {
        setError(data.error ?? "创建批次失败");
        setSubmitting(false);
        return;
      }
      const jobResponse = await fetch(`/api/jobs/${data.jobId}`, { cache: "no-store" });
      const jobData = (await jobResponse.json().catch(() => null)) as JobResponse | null;
      setJob(
        jobData ?? {
          id: data.jobId,
          status: "PENDING",
          progress: 0,
          errorMessage: null,
          objectId: data.batchId ?? "",
        },
      );
    } catch {
      setError("网络异常，创建批次失败");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="steps">
        {STEPS.map((item) => (
          <div
            key={item.number}
            className={`step ${step === item.number ? "active" : ""} ${
              step > item.number ? "done" : ""
            }`}
          >
            <span className="step-num">
              {step > item.number ? <IconCheck width={13} height={13} /> : item.number}
            </span>
            {item.label}
          </div>
        ))}
      </div>

      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">上传月度佣金总表</div>
              <div className="card-sub">
                支持 .xlsx，系统会自动识别工作表、表头和字段别名；单文件上限由部署配置控制。
              </div>
            </div>
          </div>
          <div className="card-body">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void uploadFile(selected);
                event.target.value = "";
              }}
            />

            <div
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
              }}
            >
              <div className="dropzone-icon">
                <IconUpload width={22} height={22} />
              </div>
              <div className="dropzone-title">
                {uploading ? "正在上传并识别表头…" : "点击选择文件，或将 .xlsx 拖到这里"}
              </div>
              <div className="dropzone-sub">
                文件仅用于生成批次，原始文件会留存并记录 SHA-256 摘要
              </div>
            </div>

            {uploading ? (
              <div className="mt-4">
                <ProgressBar value={uploadPercent || 5} />
                <div className="progress-info">
                  <span>上传中，完成后会自动识别工作表与表头</span>
                  <span>{uploadPercent}%</span>
                </div>
              </div>
            ) : null}

            {file && !uploading ? (
              <div className="file-chip">
                <IconFile width={20} height={20} style={{ color: "var(--primary)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">{file.name}</div>
                  <div className="meta">
                    {formatFileSize(file.size)}
                    {preview ? ` · ${preview.preview.sheets.length} 个工作表` : ""}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={resetFile}>
                  <IconX width={14} height={14} />
                  移除
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 2 && preview ? (
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">确认佣金所属月份与数据表</div>
                <div className="card-sub">
                  文件名识别建议值仅供参考，最终以管理员确认的月份为准。
                </div>
              </div>
              <span className="badge badge-gray">{preview.fileName}</span>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div className="field">
                  <label htmlFor="month">佣金所属月份 M</label>
                  <input
                    id="month"
                    className="input"
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                    disabled={submitting}
                  />
                  <span className="hint">
                    新增人员将筛选 M+1 的入职月份，转非筛选 M；跨年自动计算。
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="sheet">数据工作表</label>
                  <select
                    id="sheet"
                    className="select"
                    value={selectedSheetName}
                    onChange={(event) => setSelectedSheetName(event.target.value)}
                    disabled={submitting}
                  >
                    {preview.preview.sheets.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                        {item.headerRow
                          ? `（表头第 ${item.headerRow} 行，数据 ${item.dataRows} 行）`
                          : "（未识别到表头）"}
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    共 {preview.preview.sheets.length} 个工作表；当前工作表数据行数{" "}
                    {sheet?.dataRows ?? 0}。
                  </span>
                </div>
              </div>

              <div className="field mt-4">
                <label htmlFor="note">批次备注（可选）</label>
                <input
                  id="note"
                  className="input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="例如：2026年7月佣金，人资初版"
                  disabled={submitting}
                  maxLength={200}
                />
              </div>

              <div className="divider" />

              <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>
                字段识别
              </div>
              <div className="recognized-grid">
                {FIELD_DEFS.map((def) => {
                  const matched = sheet?.headersByField?.[def.key as FieldKey];
                  const ok = Boolean(matched);
                  return (
                    <div key={def.key} className={`recognized-item ${ok ? "ok" : def.required ? "missing" : ""}`}>
                      <div style={{ marginTop: 2, color: ok ? "var(--success)" : def.required ? "var(--danger)" : "var(--muted-2)" }}>
                        {ok ? <IconCheck width={14} height={14} /> : <IconAlert width={14} height={14} />}
                      </div>
                      <div>
                        <div className="label">
                          {def.label}
                          {def.required ? " *" : ""}
                        </div>
                        <div className="value">{matched ?? "未识别"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {missingRequired.length ? (
                <div className="mt-4">
                  <Callout tone="danger">
                    缺少必需字段：{missingRequired.join("、")}。请在工作表中选择正确的表头行，或在“系统配置”中补充字段别名后重新上传。
                  </Callout>
                </div>
              ) : null}
              {duplicates.length ? (
                <div className="mt-4">
                  <Callout tone="danger">
                    存在重复表头：{duplicates.join("、")}。请清理源表后重新上传。
                  </Callout>
                </div>
              ) : null}
              {conflicts.length ? (
                <div className="mt-4">
                  <Callout tone="danger">
                    多个表头同时匹配同一字段：{conflicts.join("、")}。请调整字段别名配置。
                  </Callout>
                </div>
              ) : null}

              {sheet?.sampleRows?.length ? (
                <div className="mt-6">
                  <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>
                    源数据预览（前 {Math.min(sheet.sampleRows.length, 5)} 行）
                  </div>
                  <div className="table-wrap" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          {sheet.headers.slice(0, 12).map((header, index) => (
                            <th key={`${header}-${index}`}>{header || `列${index + 1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.sampleRows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {sheet.headers.slice(0, 12).map((_, cellIndex) => (
                              <td key={cellIndex}>{row[cellIndex] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sheet.headers.length > 12 ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      仅展示前 12 列，共 {sheet.headers.length} 列。
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn btn-secondary" type="button" onClick={resetFile} disabled={submitting}>
              重新选择文件
            </button>
            <button className="btn btn-primary" type="button" onClick={generate} disabled={!canGenerate}>
              生成批次并校验
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="card">
          <div className="card-body" style={{ padding: 28 }}>
            <div className="card-title" style={{ fontSize: 16 }}>
              正在解析、校验并拆分数据
            </div>
            <div className="card-sub" style={{ marginBottom: 18 }}>
              系统会依次完成有效数据过滤、组织归属、四类数据集生成和守恒校验。请勿关闭页面。
            </div>
            <ProgressBar value={job?.progress ?? 3} />
            <div className="progress-info">
              <span>
                {job?.status === "FAILED"
                  ? "处理失败"
                  : job?.status === "SUCCEEDED"
                    ? "处理完成，正在跳转…"
                    : "处理中，请稍候"}
              </span>
              <span>{job?.progress ?? 0}%</span>
            </div>
            {job?.status === "FAILED" ? (
              <div className="mt-4">
                <Callout tone="danger">{job.errorMessage ?? "处理失败"}</Callout>
                <div style={{ marginTop: 14 }}>
                  <button className="btn btn-secondary" type="button" onClick={resetFile}>
                    重新上传
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
