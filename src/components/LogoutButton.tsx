"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={logout}
      disabled={loading}
      title="退出登录"
    >
      {loading ? "退出中…" : "退出登录"}
    </button>
  );
}
