"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconX } from "@/components/icons";

export default function BatchActions({
  batchId,
  status,
}: {
  batchId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"publish" | "void" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function call(action: "publish" | "void") {
    const confirmation =
      action === "publish"
        ? "发布后省负责人即可查看并下载。若同月已有发布版本，旧版本会自动标记为“已替代”。确认发布？"
        : "作废后省负责人将无法查看和下载该批次，且当月归集会排除该批次。确认作废？";
    if (!window.confirm(confirmation)) return;

    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/batches/${batchId}/${action}`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "操作失败");
        return;
      }
      router.refresh();
    } catch {
      setMessage("网络异常，操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {message ? <span className="badge badge-red">{message}</span> : null}
      {status === "DRAFT" ? (
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => void call("publish")}
          disabled={busy !== null}
        >
          <IconCheck width={16} height={16} />
          {busy === "publish" ? "发布中…" : "发布批次"}
        </button>
      ) : null}
      {status === "DRAFT" || status === "PUBLISHED" ? (
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => void call("void")}
          disabled={busy !== null}
        >
          <IconX width={15} height={15} />
          {busy === "void" ? "处理中…" : "作废批次"}
        </button>
      ) : null}
    </div>
  );
}
