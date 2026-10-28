import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { IconDatabase, IconLock, IconShield } from "@/components/icons";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/province");

  return (
    <div className="login-screen">
      <section className="login-brand">
        <div className="login-brand-top">
          <div className="brand-mark">佣</div>
          <div>
            <div className="brand-title">保险代理人佣金个税申报</div>
            <div className="brand-sub">DATA MANAGEMENT SYSTEM</div>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <h1>
            每月佣金数据
            <br />
            从拆分到归集，一次闭环
          </h1>
          <p>
            集团管理员上传佣金总表，系统按省拆分并生成四类申报 Sheet；省负责人仅能查看本人数据，
            下载加工后回传，系统自动与原始数据逐条比对，无差异才进入归集。
          </p>

          <div className="login-points">
            <div className="login-point">
              <div className="login-point-icon">
                <IconLock width={16} height={16} />
              </div>
              <div>
                省级数据隔离
                <span>服务端强制按组织授权过滤，导出地址不能越权</span>
              </div>
            </div>
            <div className="login-point">
              <div className="login-point-icon">
                <IconDatabase width={16} height={16} />
              </div>
              <div>
                四个 Sheet 一次生成
                <span>新增人员、转非、劳动报酬收入、汇总统一口径</span>
              </div>
            </div>
            <div className="login-point">
              <div className="login-point-icon">
                <IconShield width={16} height={16} />
              </div>
              <div>
                回传自动核对
                <span>证件号码 + 姓名逐条比对，差异不通过并留痕</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, color: "#475569", fontSize: 12 }}>
          京东数科保代 · 内部数据系统 · 操作全程审计
        </div>
      </section>

      <section className="login-form-side">
        <LoginForm />
      </section>
    </div>
  );
}
