import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { SESSION_COOKIE, getUserFromToken, type AuthUser, type Role } from "./session";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return getUserFromToken(getDb(), token);
}

export async function requirePageUser(role?: Role): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) {
    redirect(user.role === "ADMIN" ? "/admin" : "/province");
  }
  return user;
}
