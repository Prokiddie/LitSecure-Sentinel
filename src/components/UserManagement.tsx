/**
 * LitSecure Sentinel — User Management UI
 * Admin-only panel. Create, edit, deactivate, and delete platform users.
 * Glassmorphism design consistent with the rest of the system.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Search, Shield, Edit3, Trash2, Power,
  Eye, EyeOff, Check, X, Loader2, Copy, ChevronDown,
  UserCheck, UserX, RefreshCw, AlertTriangle, Key
} from "lucide-react";

interface User {
  id:           string;
  email:        string;
  name:         string;
  role:         string;
  organization: string;
  is_active:    boolean;
  created_at:   string;
  last_login?:  string;
}

const ROLES = ["admin", "analyst", "investigator", "auditor", "citizen"];

const ROLE_BADGE: Record<string, string> = {
  admin:        "text-red-400 bg-red-500/10 border-red-500/30",
  analyst:      "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/30",
  investigator: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  auditor:      "text-purple-400 bg-purple-500/10 border-purple-500/30",
  citizen:      "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

// ─── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated, token }: { onClose: () => void; onCreated: (u: User) => void; token: string }) {
  const [form, setForm] = useState({ email: "", name: "", role: "analyst", organization: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [created, setCreated] = useState<{ user: User; tempPassword?: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.name) { setError("Email and name are required."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to create user."); return; }
      setCreated({ user: data, tempPassword: data.tempPassword });
      onCreated(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-5"
        style={{ background: "rgba(10,14,26,0.97)", backdropFilter: "blur(24px)" }}>

        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <div className="w-9 h-9 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
            <Plus className="w-5 h-5 text-[#FFD600]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Create Platform User</h3>
            <p className="text-[10px] text-slate-500 font-mono">New account for LitSecure Sentinel</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white transition"><X className="w-4 h-4" /></button>
        </div>

        {created ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-400 text-sm font-mono">
              <Check className="w-4 h-4" /> User created successfully!
            </div>
            <div className="bg-[#05080F] border border-white/5 rounded-xl p-4 space-y-2 text-sm font-mono">
              <div className="text-slate-400">Email: <span className="text-white">{created.user.email}</span></div>
              <div className="text-slate-400">Role: <span className="text-[#FFD600]">{created.user.role}</span></div>
              {created.tempPassword && (
                <div className="mt-3 p-3 bg-[#FFD600]/10 border border-[#FFD600]/20 rounded-lg">
                  <div className="text-[9px] text-[#FFD600] font-bold uppercase mb-1">Temporary Password (share securely)</div>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm break-all">{created.tempPassword}</span>
                    <button onClick={() => navigator.clipboard.writeText(created.tempPassword!)} className="shrink-0 text-slate-400 hover:text-white">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={onClose} className="w-full py-2 rounded-xl bg-[#FFD600] text-[#05080F] font-bold text-sm">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="text-red-400 text-xs font-mono p-2 bg-red-500/10 border border-red-500/20 rounded-lg">{error}</div>}

            {[
              { field: "name",         label: "Full Name",    placeholder: "John Banda",          type: "text" },
              { field: "email",        label: "Email",        placeholder: "john@macra.mw",       type: "email" },
              { field: "organization", label: "Organization", placeholder: "Ministry of Finance", type: "text" },
            ].map(({ field, label, placeholder, type }) => (
              <div key={field} className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono uppercase">{label}</label>
                <input
                  type={type}
                  value={(form as any)[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  className="glass-form w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none"
                />
              </div>
            ))}

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-mono uppercase">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="glass-form w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              >
                {ROLES.map(r => <option key={r} value={r} className="bg-[#0A0E1A]">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-mono uppercase">Password <span className="text-slate-600">(leave blank for auto-generated)</span></label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to auto-generate"
                  className="glass-form w-full rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 outline-none"
                />
                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-[#FFD600] text-[#05080F] font-bold text-sm hover:bg-[#FF9800] transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Plus className="w-4 h-4" /> Create User</>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { token: string; }

export default function UserManagement({ token }: Props) {
  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<{ id: string; role: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const authH = () => ({ "Content-Type": "application/json", "Authorization": `Bearer ${token}` });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { headers: authH() });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const toggleActive = async (user: User) => {
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      if (res.ok) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !user.is_active } : u));
    } finally { setActionLoading(null); }
  };

  const changeRole = async (id: string, role: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "PATCH", headers: authH(), body: JSON.stringify({ role }) });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
        setEditingRole(null);
      }
    } finally { setActionLoading(null); }
  };

  const deleteUser = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE", headers: authH() });
      if (res.ok) { setUsers(prev => prev.filter(u => u.id !== id)); setConfirmDelete(null); }
    } finally { setActionLoading(null); }
  };

  const filtered = users.filter(u =>
    (roleFilter === "all" || u.role === roleFilter) &&
    (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6" id="user-management">
      {showCreate && (
        <CreateUserModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={u => { setUsers(prev => [u, ...prev]); setShowCreate(false); }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-[#FFD600]" />
          </div>
          <div>
            <h2 className="font-bebas text-xl text-white tracking-widest">USER MANAGEMENT</h2>
            <p className="text-[10px] text-slate-500 font-mono">{users.length} registered users · Admin only</p>
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <button onClick={loadUsers} className="p-2 rounded-lg text-slate-400 hover:text-white border border-white/10 hover:border-white/20 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFD600] text-[#05080F] font-bold text-sm hover:bg-[#FF9800] transition" id="create-user-btn">
            <Plus className="w-4 h-4" /> Create User
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="glass-form w-full rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none"
            id="user-search"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="glass-form rounded-xl px-3 py-2.5 text-sm text-white outline-none"
        >
          <option value="all" className="bg-[#0A0E1A]">All Roles</option>
          {ROLES.map(r => <option key={r} value={r} className="bg-[#0A0E1A]">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Users",   val: users.length,                              color: "text-slate-300" },
          { label: "Active",        val: users.filter(u => u.is_active).length,     color: "text-green-400" },
          { label: "Analysts",      val: users.filter(u => u.role === "analyst").length, color: "text-[#FFD600]" },
          { label: "Admins",        val: users.filter(u => u.role === "admin").length,   color: "text-red-400" },
        ].map(({ label, val, color }) => (
          <div key={label} className="card p-4 text-center">
            <div className={`text-2xl font-bold font-mono ${color}`}>{val}</div>
            <div className="text-[10px] text-slate-500 font-mono uppercase mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* User table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400 font-mono text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading users...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500 text-sm font-mono">No users found.</p>
            {users.length === 0 && <p className="text-slate-600 text-xs font-mono mt-1">The users table may not exist yet in SQLite. Try creating one first.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["User", "Role", "Organization", "Status", "Created", "Actions"].map(h => (
                    <th key={h} className="text-left text-[10px] font-mono uppercase text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(user => (
                  <tr key={user.id} className="hover:bg-white/2 transition group">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FFD600]/30 to-[#FF9800]/30 border border-[#FFD600]/20 flex items-center justify-center text-[10px] font-bold text-[#FFD600] shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{user.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3">
                      {editingRole?.id === user.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={editingRole.role}
                            onChange={e => setEditingRole({ id: user.id, role: e.target.value })}
                            className="text-[10px] bg-[#0A0E1A] border border-white/10 rounded px-1 py-0.5 text-white outline-none"
                          >
                            {ROLES.map(r => <option key={r} value={r} className="bg-[#0A0E1A]">{r}</option>)}
                          </select>
                          <button onClick={() => changeRole(user.id, editingRole.role)} className="text-green-400 hover:text-green-300 p-0.5">
                            {actionLoading === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button onClick={() => setEditingRole(null)} className="text-slate-500 hover:text-white p-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-mono ${ROLE_BADGE[user.role] || ROLE_BADGE.citizen}`}>
                            {user.role}
                          </span>
                          <button onClick={() => setEditingRole({ id: user.id, role: user.role })} className="opacity-0 group-hover:opacity-100 transition text-slate-500 hover:text-white">
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    {/* Org */}
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-32 truncate">{user.organization || "—"}</td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-[9px] font-bold uppercase font-mono ${user.is_active ? "text-green-400" : "text-slate-500"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {/* Created */}
                    <td className="px-4 py-3 text-[10px] text-slate-500 font-mono whitespace-nowrap">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => toggleActive(user)}
                          disabled={actionLoading === user.id}
                          title={user.is_active ? "Deactivate" : "Activate"}
                          className={`p-1.5 rounded-lg transition ${user.is_active ? "text-orange-400 hover:bg-orange-500/10" : "text-green-400 hover:bg-green-500/10"}`}
                        >
                          {actionLoading === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : user.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                        {confirmDelete === user.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteUser(user.id)} className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10 transition text-[9px] font-mono font-bold">Confirm</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-slate-500 hover:text-white p-1 rounded"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
