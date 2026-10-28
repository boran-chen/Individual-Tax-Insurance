"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/utils/format";
import { IconPlus, IconX } from "@/components/icons";
import { StatusBadge } from "@/components/ui";

type Org = { id: string; name: string; short_name: string };

type UserItem = {
  id: string;
  name: string;
  login: string;
  role: "ADMIN" | "PROVINCE";
  status: string;
  createdAt: string;
  orgs: Array<{ id: string; name: string }>;
};

export default function UsersManager({
  initialUsers,
  organizations,
}: {
  initialUsers: UserItem[];
  organizations: Org[];
}) {
  const router = useRouter();
  const users = initialUsers;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "PROVINCE">("PROVINCE");
  const [status, setStatus] = useState("ACTIVE");
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const orgsById = useMemo(
    () => new Map(organizations.map((org) => [org.id, org])),
    [organizations],
  );

  function openCreate() {
    setEditing(null);
    setName("");
    setLogin("");
    setPassword("");
    setRole("PROVINCE");
    setStatus("ACTIVE");
    setOrgIds([]);
    setError(null);
    setOpen(true);
  }

  function openEdit(user: UserItem) {
    setEditing(user);
    setName(user.name);
    setLogin(user.login);
    setPassword("");
    setRole(user.role);
    setStatus(user.status);
    setOrgIds(user.orgs.map((org) => org.id));
    setError(null);
    setOpen(true);
  }

  function toggleOrg(orgId: string) {
    setOrgIds((current) =>
      current.includes(orgId) ? current.filter((id) => id !== orgId) : [...current, orgId],
    );
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("请输入姓名");
      return;
    }
    if (!editing && !login.trim()) {
      setError("请输入登录名");
      return;
    }
    if (!editing && password.length < 8) {
      setError("初始密码至少 8 位");
      return;
    }
    if (role === "PROVINCE" && orgIds.length === 0) {
      setError("省级负责人至少绑定一个组织");
      return;
    }

    setSaving(true);
    try {
      const body = editing
        ? {
            name,
            status,
            orgIds: role === "PROVINCE" ? orgIds : [],
            ...(password ? { password } : {}),
          }
        : { name, login, password, role, orgIds: role === "PROVINCE" ? orgIds : [] };

      const response = await fetch(
        editing ? `/api/admin/users/${editing.id}` : "/api/admin/users",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("网络异常，保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">账号列表</div>
          <div className="card-sub">一个组织可配置多名负责人，一名负责人可负责多个组织。</div>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          <IconPlus width={16} height={16} />
          新增账号
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>登录名</th>
              <th>角色</th>
              <th>绑定组织</th>
              <th>状态</th>
              <th>创建时间</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="strong">{user.name}</td>
                <td className="mono">{user.login}</td>
                <td>
                  <span className={`badge ${user.role === "ADMIN" ? "badge-blue" : "badge-gray"}`}>
                    {user.role === "ADMIN" ? "集团管理员" : "省级负责人"}
                  </span>
                </td>
                <td className="wrap" style={{ maxWidth: 380 }}>
                  {user.role === "ADMIN"
                    ? "全国"
                    : user.orgs.length
                      ? user.orgs.map((org) => org.name).join("、")
                      : "未绑定"}
                </td>
                <td>
                  <StatusBadge status={user.status} />
                </td>
                <td className="muted">{formatDateTime(user.createdAt)}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => openEdit(user)}>
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => (saving ? null : setOpen(false))}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{editing ? "编辑账号" : "新增账号"}</div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
                <IconX width={16} height={16} />
              </button>
            </div>
            <div className="modal-body">
              {error ? (
                <div className="login-error" style={{ marginBottom: 14 }}>
                  {error}
                </div>
              ) : null}
              <div className="form-grid">
                <div className="form-row">
                  <div className="field">
                    <label>姓名</label>
                    <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
                  </div>
                  <div className="field">
                    <label>登录名</label>
                    <input
                      className="input"
                      value={login}
                      disabled={Boolean(editing)}
                      onChange={(event) => setLogin(event.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>{editing ? "重置密码（留空不修改）" : "初始密码"}</label>
                    <input
                      className="input"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 8 位，含字母和数字"
                    />
                  </div>
                  <div className="field">
                    <label>角色</label>
                    <select
                      className="select"
                      value={role}
                      disabled={Boolean(editing)}
                      onChange={(event) => setRole(event.target.value as "ADMIN" | "PROVINCE")}
                    >
                      <option value="PROVINCE">省级负责人</option>
                      <option value="ADMIN">集团管理员</option>
                    </select>
                  </div>
                </div>

                {editing ? (
                  <div className="field">
                    <label>状态</label>
                    <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option value="ACTIVE">启用</option>
                      <option value="DISABLED">停用</option>
                    </select>
                  </div>
                ) : null}

                {role === "PROVINCE" ? (
                  <div className="field">
                    <label>绑定组织（可多选）</label>
                    <div className="checkbox-grid">
                      {organizations.map((org) => (
                        <label key={org.id} className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={orgIds.includes(org.id)}
                            onChange={() => toggleOrg(org.id)}
                          />
                          {org.short_name}
                        </label>
                      ))}
                    </div>
                    <span className="hint">
                      已选 {orgIds.length} 个：
                      {orgIds.map((id) => orgsById.get(id)?.short_name).filter(Boolean).join("、") || "—"}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)} disabled={saving}>
                取消
              </button>
              <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
