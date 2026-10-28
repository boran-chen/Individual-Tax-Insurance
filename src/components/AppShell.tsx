import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/session";
import { RULES_VERSION_LABEL } from "@/lib/rules/v1/version";
import Nav from "./Nav";
import LogoutButton from "./LogoutButton";

export default function AppShell({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const roleLabel = user.role === "ADMIN" ? "集团管理员" : "省级负责人";
  const initials = user.name.slice(0, 1);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">佣</div>
          <div>
            <div className="brand-title">佣金个税申报</div>
            <div className="brand-sub">DATA MANAGEMENT</div>
          </div>
        </div>

        <Nav role={user.role} />

        <div className="sidebar-foot">
          <div className="rule-version">{RULES_VERSION_LABEL}</div>
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{roleLabel}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <strong>保险代理人佣金个税申报</strong>
            <span>/</span>
            <span>{roleLabel}</span>
          </div>
          <div className="topbar-right">
            <span className="badge badge-gray">{RULES_VERSION_LABEL}</span>
            <LogoutButton />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
