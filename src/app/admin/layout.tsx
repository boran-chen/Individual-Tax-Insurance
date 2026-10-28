import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser("ADMIN");
  return <AppShell user={user}>{children}</AppShell>;
}
