import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "保险代理人佣金个税申报数据管理系统",
  description: "佣金总表上传、分省拆分、四 Sheet 下载、回传比对与归集",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
