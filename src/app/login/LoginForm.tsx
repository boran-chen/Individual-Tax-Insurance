"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconLock } from "@/components/icons";

export default function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "登录失败，请稍后重试");
        return;
      }
      router.push(data.redirect ?? "/");
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <div
        className="brand-mark"
        style={{ marginBottom: 22, width: 44, height: 44, fontSize: 18 }}
      >
        佣
      </div>
      <h2>登录系统</h2>
      <p className="sub">请使用集团分配的账号登录。省级负责人仅能访问本人负责组织的数据。</p>

      {error ? <div className="login-error">{error}</div> : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="login">账号</label>
          <input
            id="login"
            className="input"
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            placeholder="请输入登录账号"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ height: 42 }}>
          {loading ? "登录中…" : "登录"}
          {!loading ? <IconArrowRight width={16} height={16} /> : null}
        </button>
      </div>

      <div className="login-foot">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <IconLock width={13} height={13} />
          演示账号（开发环境种子数据）
        </div>
        管理员：<code>admin</code> / <code>Admin@12345</code>
        <br />
        省负责人：<code>gd_user</code>（广东）、<code>sz_user</code>（深圳）、
        <code>bj_user</code>（北京）/ <code>Prov@12345</code>
      </div>
    </form>
  );
}
