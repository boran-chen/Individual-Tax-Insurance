import Link from "next/link";
import { IconFile } from "@/components/icons";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div
        className="card"
        style={{ maxWidth: 420, width: "100%", padding: 40, textAlign: "center" }}
      >
        <div className="empty-icon">
          <IconFile width={22} height={22} />
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>页面不存在或无权访问</h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
          请检查链接，或返回您有权限的页面。省级负责人只能访问本人负责组织的数据。
        </p>
        <Link className="btn btn-primary" href="/">
          返回首页
        </Link>
      </div>
    </div>
  );
}
