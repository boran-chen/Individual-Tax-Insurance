"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateTime, formatFileSize, formatNumber, monthText } from "@/lib/utils/format";
import {
  Callout,
  EmptyState,
  ProgressBar,
  StatusBadge,
} from "@/components/ui";
import {
  IconFile,
  IconUpload,
  IconX,
} from "@/components/icons";

type Task = {
  org_id: string;
  org_name: string;
  short_name: string;
  task_status: string;
  submission_id: string | null;
  submission_version: number | null;
  file_name: string | null;
  submission_status: string | null;
  total_rows: number | null;
  matched_rows: number | null;
  diff_count: number | null;
  created_at: string | null;
  compared_at: string | null;
  error_message: string | null;
  batch_id: string;
  month: string;
  batch_version: number;
};

type Submission = {
  id: string;
  version: number;
  file_name: string;
  status: string;
  total_rows: number;
  matched_rows: number;
  diff_count: number;
  created_at: string;
  compared_at: string | null;
  error_message: string | null;
};

type Job = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress: number;
  errorMessage: string | null;
  objectId: string;
};

export default function ReturnUploader({
  tasks,
  selectedBatchId,
  selectedOrgId,
  submissions,
}: {
  tasks: Task[];
  selectedBatchId: string | null;
  selectedOrgId: string | null;
  submissions: Submission[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected =
    tasks.find((task) => task.batch_id === selectedBatchId && task.org_id === selectedOrgId) ??
    tasks[0];
  const busy = selected?.task_status === "PENDING_COMPARE" || selected?.task_status === "COMPARING";

  useEffect(() => {
    if (!job || job.status === "SUCCEEDED" || job.status === "FAILED") return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as Job;
        setJob(data);
        if (data.status === "SUCCEEDED" || data.status === "FAILED") {
          if (data.objectId) {
            router.push(`/province/returns/${data.objectId}`);
          } else {
            router.refresh();
          }
        }
      } catch {
        // 等待下一次
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [job, router]);

  function switchTask(value: string) {
    const [batchId, orgId] = value.split("|");
    router.push(`/province/returns?batchId=${batchId}&orgId=${orgId}`);
  }

  async function upload(nextFile: File) {
    if (!selected) return;
    setError(null);
    setFile(nextFile);
    setUploading(true);
    setUploadPercent(0);
    setJob(null);

    try {
      const data = await new Promise<{ submissionId: string; jobId: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open(
            "POST",
            `/api/returns?batchId=${selected.batch_id}&orgId=${selected.org_id}&fileName=${encodeURIComponent(nextFile.name)}`,
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
              resolve(parsed as { submissionId: string; jobId: string });
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
        },
      );

      setJob({
        id: data.jobId,
        status: "PENDING",
        progress: 0,
        errorMessage: null,
        objectId: data.submissionId,
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  if (!tasks.length || !selected) {
    return (
      <div className="card">
        <EmptyState
          title="暂无可回传批次"
          description="集团管理员发布批次并生成回传任务后，您可以在这里上传回传文件。"
        />
      </div>
    );
  }

  return (
    <div className="stack">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">选择回传任务</div>
            <div className="card-sub">
              每个批次、每个组织单独回传；同一组织可多次回传，以最新一次结果为准。
            </div>
          </div>
          <StatusBadge status={selected.task_status} />
        </div>
        <div className="card-body">
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <select
              className="select"
              style={{ maxWidth: 420 }}
              value={`${selected.batch_id}|${selected.org_id}`}
              onChange={(event) => switchTask(event.target.value)}
            >
              {tasks.map((task) => (
                <option key={`${task.batch_id}|${task.org_id}`} value={`${task.batch_id}|${task.org_id}`}>
                  {monthText(task.month)} V{task.batch_version} · {task.org_name}
                </option>
              ))}
            </select>
            <a
              className="btn btn-secondary"
              href={`/api/batches/${selected.batch_id}/organizations/${selected.org_id}/export`}
            >
              重新下载申报数据
            </a>
            <Link className="btn btn-secondary" href={`/province/batches/${selected.batch_id}?orgId=${selected.org_id}`}>
              查看四个看板
            </Link>
          </div>

          <div className="divider" />

          <dl className="kv">
            <dt>批次</dt>
            <dd>
              {monthText(selected.month)} · V{selected.batch_version}
            </dd>
            <dt>组织</dt>
            <dd>{selected.org_name}</dd>
            <dt>最新回传</dt>
            <dd>
              {selected.submission_id ? (
                <span>
                  V{selected.submission_version} · <StatusBadge status={selected.submission_status ?? ""} />{" "}
                  <span className="muted">
                    {selected.created_at ? formatDateTime(selected.created_at) : ""}
                  </span>
                </span>
              ) : (
                "尚未回传"
              )}
            </dd>
            {selected.diff_count !== null ? (
              <>
                <dt>差异数</dt>
                <dd style={{ color: selected.diff_count ? "var(--danger)" : "var(--success)" }}>
                  {formatNumber(selected.diff_count)}
                </dd>
              </>
            ) : null}
            {selected.error_message ? (
              <>
                <dt>错误信息</dt>
                <dd style={{ color: "var(--danger)" }}>{selected.error_message}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">上传回传文件</div>
            <div className="card-sub">
              支持 .xlsx；默认读取“3劳动报酬收入”Sheet。通过后才进入当月归集。
            </div>
          </div>
        </div>
        <div className="card-body">
          {busy ? (
            <Callout tone="warning">上一次回传正在比对，请稍后刷新页面再试。</Callout>
          ) : (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next) void upload(next);
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
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const next = event.dataTransfer.files?.[0];
                  if (next) void upload(next);
                }}
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
                  {uploading ? "正在上传回传文件…" : "点击或拖拽回传文件到这里"}
                </div>
                <div className="dropzone-sub">上传后系统会立即解析并与原始数据逐条比对</div>
              </div>
            </>
          )}

          {uploading ? (
            <div className="mt-4">
              <ProgressBar value={uploadPercent || 5} />
              <div className="progress-info">
                <span>上传中</span>
                <span>{uploadPercent}%</span>
              </div>
            </div>
          ) : null}

          {file ? (
            <div className="file-chip">
              <IconFile width={20} height={20} style={{ color: "var(--primary)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{file.name}</div>
                <div className="meta">{formatFileSize(file.size)}</div>
              </div>
              {!uploading ? (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setFile(null)}>
                  <IconX width={14} height={14} />
                  移除
                </button>
              ) : null}
            </div>
          ) : null}

          {job ? (
            <div className="mt-4">
              <ProgressBar value={job.progress} />
              <div className="progress-info">
                <span>
                  {job.status === "SUCCEEDED"
                    ? "比对完成，正在打开结果…"
                    : job.status === "FAILED"
                      ? "比对任务失败，正在打开结果…"
                      : "正在解析并比对…"}
                </span>
                <span>{job.progress}%</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">回传历史</div>
            <div className="card-sub">同一任务的所有版本都会保留，供追溯。</div>
          </div>
          <span className="badge badge-gray">{submissions.length} 次</span>
        </div>
        {submissions.length === 0 ? (
          <EmptyState title="还没有回传记录" description="上传第一份回传文件后，这里会显示比对结果。" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>版本</th>
                  <th>文件</th>
                  <th>状态</th>
                  <th className="num">记录 / 匹配</th>
                  <th className="num">差异</th>
                  <th>回传时间</th>
                  <th>比对时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td className="strong">V{submission.version}</td>
                    <td className="wrap" style={{ maxWidth: 220 }}>
                      {submission.file_name}
                    </td>
                    <td>
                      <StatusBadge status={submission.status} />
                    </td>
                    <td className="num">
                      {formatNumber(submission.total_rows)} / {formatNumber(submission.matched_rows)}
                    </td>
                    <td className="num">
                      {submission.diff_count > 0 ? (
                        <span style={{ color: "var(--danger)" }}>{formatNumber(submission.diff_count)}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="muted">{formatDateTime(submission.created_at)}</td>
                    <td className="muted">{formatDateTime(submission.compared_at)}</td>
                    <td>
                      <Link className="btn btn-secondary btn-sm" href={`/province/returns/${submission.id}`}>
                        查看明细
                      </Link>
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
