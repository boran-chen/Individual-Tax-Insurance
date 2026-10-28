"use client";

import { useEffect } from "react";
import { IconAlert } from "@/components/icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div
        className="card"
        style={{ maxWidth: 460, width: "100%", padding: 40, textAlign: "center" }}
      >
        <div className="empty-icon" style={{ color: "var(--danger)" }}>
          <IconAlert width={22} height={22} />
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>页面加载失败</h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
          {error.message || "发生了未预期的错误，请稍后重试。"}
        </p>
        <button className="btn btn-primary" type="button" onClick={reset}>
          重新加载
        </button>
      </div>
    </div>
  );
}
