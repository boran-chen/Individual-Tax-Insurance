"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconAudit,
  IconDashboard,
  IconMapPin,
  IconReturns,
  IconSettings,
  IconUpload,
  IconUsers,
} from "./icons";
import type { Role } from "@/lib/auth/session";

const ADMIN_ITEMS = [
  { href: "/admin", label: "批次总览", icon: IconDashboard, exact: true },
  { href: "/admin/batches/new", label: "新建上传", icon: IconUpload },
  { href: "/admin/aggregation", label: "回传与归集", icon: IconReturns },
];

const ADMIN_MANAGE = [
  { href: "/admin/users", label: "账号与权限", icon: IconUsers },
  { href: "/admin/mappings", label: "省份映射", icon: IconMapPin },
  { href: "/admin/settings", label: "系统配置", icon: IconSettings },
  { href: "/admin/audit", label: "审计日志", icon: IconAudit },
];

const PROVINCE_ITEMS = [
  { href: "/province", label: "我的批次", icon: IconDashboard, exact: true },
  { href: "/province/returns", label: "回传与结果", icon: IconReturns },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Nav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = role === "ADMIN" ? ADMIN_ITEMS : PROVINCE_ITEMS;

  return (
    <nav className="nav">
      <div className="nav-section">工作台</div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive(pathname, item.href, item.exact) ? "active" : ""}`}
          >
            <Icon />
            {item.label}
          </Link>
        );
      })}

      {role === "ADMIN" ? (
        <>
          <div className="nav-section">管理</div>
          {ADMIN_MANAGE.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive(pathname, item.href) ? "active" : ""}`}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </>
      ) : null}
    </nav>
  );
}
