import React, { useState, useEffect } from "react";
import { 
  User, 
  Lock, 
  Shield, 
  Key, 
  QrCode, 
  Download, 
  Check, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  RefreshCw,
  Image as ImageIcon
} from "lucide-react";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  mfa_enabled?: boolean;
}

interface UserProfileProps {
  token: string;
  user: AuthUser;
  onUpdateUser: (user: AuthUser) => void;
}

type TabId = "account" | "password" | "mfa" | "assets";

export default function UserProfile({ token, user, onUpdateUser }: UserProfileProps) {
  const [activeTab, setActiveTab] = useState<TabId>("account");
  
  // Account settings state
  const [fullName, setFullName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || "");
  const [accountSuccess, setAccountSuccess] = useState("");
  const [accountError, setAccountError] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(!!user.mfa_enabled);
  const [mfaSetupData, setMfaSetupData] = useState<{ qrDataUrl: string; manualKey: string } | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaSuccess, setMfaSuccess] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  // Reset notifications on tab switch
  useEffect(() => {
    setAccountSuccess("");
    setAccountError("");
    setPasswordSuccess("");
    setPasswordError("");
    setMfaSuccess("");
    setMfaError("");
    setMfaSetupData(null);
    setMfaToken("");
    setDisablePassword("");
    setDisableToken("");
    setConfirmingDisable(false);
  }, [activeTab]);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "None", color: "bg-slate-700" };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    
    if (score === 1) return { score: 25, label: "Weak", color: "bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.5)]" };
    if (score === 2) return { score: 50, label: "Fair", color: "bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]" };
    if (score === 3) return { score: 75, label: "Good", color: "bg-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.5)]" };
    if (score === 4) return { score: 100, label: "Strong & Secured", color: "bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]" };
    
    return { score: 0, label: "Weak", color: "bg-red-500/80" };
  };

  const strength = getPasswordStrength(newPassword);

  // Update Profile details
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountSuccess("");
    setAccountError("");
    setSavingAccount(true);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, phone })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update profile details.");
      }

      setAccountSuccess("Account details successfully updated.");
      onUpdateUser({
        ...user,
        name: data.user.name,
        phone: data.user.phone
      });
    } catch (err: any) {
      setAccountError(err.message);
    } finally {
      setSavingAccount(false);
    }
  };

  // Change Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess("");
    setPasswordError("");
    
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch("/api/auth/profile/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update password credentials.");
      }

      setPasswordSuccess("Password updated successfully. Your new credentials are active.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Initiate MFA setup
  const handleMfaSetup = async () => {
    setMfaError("");
    setMfaSuccess("");
    try {
      const res = await fetch("/api/auth/profile/mfa/setup", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to initiate MFA setup.");
      }
      setMfaSetupData({
        qrDataUrl: data.qrDataUrl,
        manualKey: data.manualKey
      });
    } catch (err: any) {
      setMfaError(err.message);
    }
  };

  // Confirm MFA enrollment
  const handleMfaConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError("");
    setMfaSuccess("");
    setVerifyingMfa(true);

    try {
      const res = await fetch("/api/auth/profile/mfa/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ token: mfaToken })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "MFA validation failed.");
      }

      setMfaSuccess("MFA has been successfully configured and activated on your account.");
      setMfaEnabled(true);
      setMfaSetupData(null);
      setMfaToken("");
      onUpdateUser({
        ...user,
        mfa_enabled: true
      });
    } catch (err: any) {
      setMfaError(err.message);
    } finally {
      setVerifyingMfa(false);
    }
  };

  // Disable MFA
  const handleMfaDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError("");
    setMfaSuccess("");
    setConfirmingDisable(true);

    try {
      const res = await fetch("/api/auth/profile/mfa/disable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ password: disablePassword, token: disableToken })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "MFA deactivation rejected.");
      }

      setMfaSuccess("Multi-Factor Authentication has been successfully disabled.");
      setMfaEnabled(false);
      setDisablePassword("");
      setDisableToken("");
      onUpdateUser({
        ...user,
        mfa_enabled: false
      });
    } catch (err: any) {
      setMfaError(err.message);
    } finally {
      setConfirmingDisable(false);
    }
  };

  // Download SVG asset helper
  const downloadSvgAsset = (svgId: string, filename: string) => {
    const svgElement = document.getElementById(svgId);
    if (!svgElement) return;
    
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(svgBlob);
    
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  // Raw inline SVG template maps for download & preview
  const PrimaryLogoSvg = (id: string, darkBg = true) => (
    <svg id={id} width="220" height="56" viewBox="0 0 220 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="220" height="56" rx="6" fill={darkBg ? "#05080F" : "#FFD600"} />
      <g transform="translate(6, 1)">
        <path d="M6 6 L28 2 L50 6 L50 28 Q50 44 28 54 Q6 44 6 28 Z" fill={darkBg ? "#FFD600" : "#05080F"}/>
        <path d="M10 9 L28 5.5 L46 9 L46 28 Q46 41 28 50 Q10 41 10 28 Z" fill={darkBg ? "#05080F" : "#FFD600"}/>
        <path d="M24 16 L20 30 L27 30 L23 43 L35 26 L28 26 L33 16 Z" fill={darkBg ? "#FFD600" : "#05080F"}/>
      </g>
      <text x="66" y="32" fontFamily="'Space Grotesk', sans-serif" fontWeight="bold" fontSize="24" letterSpacing="2" fill={darkBg ? "#FFFFFF" : "#05080F"}>LITSECURE</text>
      <text x="67" y="46" fontFamily="'JetBrains Mono', monospace" fontSize="8" letterSpacing="1.5" fill={darkBg ? "#FFD600" : "#05080F"}>SENTINEL PLATFORM</text>
    </svg>
  );

  const LightLogoSvg = (id: string) => (
    <svg id={id} width="220" height="56" viewBox="0 0 220 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="220" height="56" rx="6" fill="#FFFFFF" />
      <g transform="translate(6, 1)">
        <path d="M6 6 L28 2 L50 6 L50 28 Q50 44 28 54 Q6 44 6 28 Z" fill="#05080F"/>
        <path d="M10 9 L28 5.5 L46 9 L46 28 Q46 41 28 50 Q10 41 10 28 Z" fill="#FFFFFF"/>
        <path d="M24 16 L20 30 L27 30 L23 43 L35 26 L28 26 L33 16 Z" fill="#FFD600"/>
      </g>
      <text x="66" y="32" fontFamily="'Space Grotesk', sans-serif" fontWeight="bold" fontSize="24" letterSpacing="2" fill="#05080F">LITSECURE</text>
      <text x="67" y="46" fontFamily="'JetBrains Mono', monospace" fontSize="8" letterSpacing="1.5" fill="#475569">SENTINEL PLATFORM</text>
    </svg>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-[1400px] mx-auto p-4 text-slate-100">
      
      {/* ── LEFT PANEL: USER CARD & TABS ─────────────────────────────────────── */}
      <div className="w-full lg:w-80 flex flex-col gap-4">
        
        {/* User Card */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-5 flex flex-col items-center text-center relative overflow-hidden shadow-xl">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-yellow-500 via-[#FFD600] to-amber-500" />
          
          <div className="relative w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center border-2 border-[#FFD600]/30 shadow-[0_0_15px_rgba(255,214,0,0.15)] mb-4 mt-2">
            <User className="w-10 h-10 text-[#FFD600]" />
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 rounded-full border-2 border-[#0A0E1A] flex items-center justify-center" title="Active Account">
              <Check className="w-3 h-3 text-white" />
            </div>
          </div>

          <h3 className="font-semibold text-lg tracking-wide">{user.name}</h3>
          <span className="text-[11px] font-mono text-[#FFD600] mt-1 bg-[#FFD600]/10 px-2.5 py-0.5 rounded-full border border-[#FFD600]/20 uppercase">
            {user.role}
          </span>

          <div className="w-full border-t border-white/5 my-4" />

          <div className="w-full flex flex-col gap-2.5 text-xs text-left">
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">Email:</span>
              <span className="text-slate-300 max-w-[160px] truncate" title={user.email}>{user.email}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">Phone:</span>
              <span className="text-slate-300">{user.phone || "Not set"}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">MFA Status:</span>
              <span className={mfaEnabled ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {mfaEnabled ? "🛡️ Enabled" : "⚠️ Inactive"}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-2 flex flex-col gap-1 shadow-lg">
          <button
            onClick={() => setActiveTab("account")}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-mono tracking-wider flex items-center gap-3 transition-all ${
              activeTab === "account"
                ? "bg-[#FFD600]/10 text-[#FFD600] border-l-2 border-[#FFD600] pl-3"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <User className="w-4 h-4" />
            ACCOUNT DETAILS
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-mono tracking-wider flex items-center gap-3 transition-all ${
              activeTab === "password"
                ? "bg-[#FFD600]/10 text-[#FFD600] border-l-2 border-[#FFD600] pl-3"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Lock className="w-4 h-4" />
            SECURITY CREDENTIALS
          </button>
          <button
            onClick={() => setActiveTab("mfa")}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-mono tracking-wider flex items-center gap-3 transition-all ${
              activeTab === "mfa"
                ? "bg-[#FFD600]/10 text-[#FFD600] border-l-2 border-[#FFD600] pl-3"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Shield className="w-4 h-4" />
            TWO-FACTOR AUTH (MFA)
          </button>
          <button
            onClick={() => setActiveTab("assets")}
            className={`w-full text-left px-4 py-3 rounded-lg text-xs font-mono tracking-wider flex items-center gap-3 transition-all ${
              activeTab === "assets"
                ? "bg-[#FFD600]/10 text-[#FFD600] border-l-2 border-[#FFD600] pl-3"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            OFFICIAL BRAND ASSETS
          </button>
        </div>

      </div>

      {/* ── RIGHT PANEL: MAIN TAB WORKSPACE ──────────────────────────────────── */}
      <div className="flex-1 bg-[#0A0E1A] border border-white/10 rounded-xl p-6 min-h-[500px] shadow-xl relative">
        
        {/* Tab Header title */}
        <div className="border-b border-white/5 pb-4 mb-6">
          <h2 className="text-xl font-semibold tracking-wide flex items-center gap-2">
            {activeTab === "account" && <><User className="text-[#FFD600]" /> Account Profile Settings</>}
            {activeTab === "password" && <><Key className="text-[#FFD600]" /> Security Credentials</>}
            {activeTab === "mfa" && <><Shield className="text-[#FFD600]" /> Multi-Factor Authentication (TOTP)</>}
            {activeTab === "assets" && <><ImageIcon className="text-[#FFD600]" /> Agency Brand Assets Center</>}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === "account" && "Update your public profile, contact details, and organization descriptors."}
            {activeTab === "password" && "Change your password key. Enforces secure, complexity-validated credentials."}
            {activeTab === "mfa" && "Protect your account from credential reuse with RFC 6238 Time-based OTPs."}
            {activeTab === "assets" && "Official high-resolution agency seals, transparent SVG logos, and vector templates."}
          </p>
        </div>

        {/* Tab Panel Content */}
        
        {/* ── TAB 1: ACCOUNT DETAILS ── */}
        {activeTab === "account" && (
          <form onSubmit={handleUpdateProfile} className="space-y-5 max-w-xl">
            {accountSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-lg text-xs font-mono flex items-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                <Check className="w-4 h-4 shrink-0" />
                {accountSuccess}
              </div>
            )}
            {accountError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {accountError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#FFD600]/50 transition"
                  placeholder="E.g. Chimwemwe Phiri"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Phone Contact</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#FFD600]/50 transition"
                  placeholder="E.g. +265 999 123 456"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Email Address (Read-Only)</label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full bg-[#05080F]/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-600 font-mono">Email alterations require governance administrator dispatch.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Role Authority</label>
                <div className="bg-[#05080F]/20 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono text-slate-400 select-none uppercase">
                  {user.role}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Active Tenant ID</label>
                <div className="bg-[#05080F]/20 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono text-slate-400 select-none">
                  {user.id}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <button
                type="submit"
                disabled={savingAccount}
                className="btn-accent px-5 py-2.5 rounded-lg text-xs font-mono tracking-wider font-bold flex items-center gap-2 hover:shadow-[0_0_15px_rgba(255,214,0,0.25)] transition-all disabled:opacity-50"
              >
                {savingAccount ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    SAVING COMPLIANT PROFILE...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    UPDATE ACCOUNT PROFILE
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 2: CREDENTIAL SECURITY ── */}
        {activeTab === "password" && (
          <form onSubmit={handleUpdatePassword} className="space-y-5 max-w-xl">
            {passwordSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-lg text-xs font-mono flex items-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                <Check className="w-4 h-4 shrink-0" />
                {passwordSuccess}
              </div>
            )}
            {passwordError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {passwordError}
              </div>
            )}

            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded-lg pl-3 pr-10 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#FFD600]/50 transition"
                  placeholder="Enter current password key"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="w-full border-t border-white/5 my-2" />

            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded-lg pl-3 pr-10 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#FFD600]/50 transition"
                  placeholder="Enforce 8+ chars, upper, lower, number"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              {/* Strength indicator */}
              {newPassword && (
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-slate-500">Security Strength:</span>
                    <span className="text-slate-300 font-bold">{strength.label}</span>
                  </div>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${strength.color} transition-all duration-300`} 
                      style={{ width: `${strength.score}%` }} 
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#FFD600]/50 transition"
                placeholder="Re-enter new password key"
              />
            </div>

            <div className="pt-4 border-t border-white/5">
              <button
                type="submit"
                disabled={savingPassword}
                className="btn-accent px-5 py-2.5 rounded-lg text-xs font-mono tracking-wider font-bold flex items-center gap-2 hover:shadow-[0_0_15px_rgba(255,214,0,0.25)] transition-all disabled:opacity-50"
              >
                {savingPassword ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    UPDATING PASSWORD...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    UPDATE ACCOUNT CREDENTIALS
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 3: MULTI-FACTOR AUTH ── */}
        {activeTab === "mfa" && (
          <div className="space-y-6 max-w-xl">
            {mfaSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-lg text-xs font-mono flex items-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.05)]">
                <Check className="w-4 h-4 shrink-0" />
                {mfaSuccess}
              </div>
            )}
            {mfaError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {mfaError}
              </div>
            )}

            {/* Active (Enabled) state */}
            {mfaEnabled && !confirmingDisable && (
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-5 relative overflow-hidden shadow-lg">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-sm tracking-wide text-emerald-400">🛡️ Multi-Factor Authentication is Enabled</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Your identity credentials are secure. The sentinel server requires an OTP (One-Time Password) authenticator app check during logins from new networks or sessions.
                    </p>
                    <div className="pt-2">
                      <button
                        onClick={() => setConfirmingDisable(true)}
                        className="bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 hover:border-red-500/40 text-red-400 px-3.5 py-1.5 text-[10px] font-mono tracking-wider font-bold rounded-lg transition-all"
                      >
                        DE-ENROLL / DISABLE MFA
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Deactivation card form */}
            {mfaEnabled && confirmingDisable && (
              <form onSubmit={handleMfaDisable} className="space-y-4 bg-red-950/10 border border-red-500/20 rounded-xl p-5">
                <h4 className="font-bold text-sm text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> De-enroll Security Verification
                </h4>
                <p className="text-xs text-slate-400">
                  Disabling MFA lowers your defensive capabilities. Verify your account keys to complete de-enrollment.
                </p>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Verify Password</label>
                    <input
                      type="password"
                      required
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500/30 transition"
                      placeholder="Enter account password"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Enter Authenticator Token (OTP)</label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={disableToken}
                      onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono tracking-[4px] text-center focus:outline-none focus:border-red-500/30 transition"
                      placeholder="000000"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={verifyingMfa}
                    className="bg-red-500 text-white hover:bg-red-600 px-4 py-2 text-xs font-mono tracking-wider font-bold rounded-lg transition disabled:opacity-50"
                  >
                    {verifyingMfa ? "DISABLING..." : "CONFIRM DE-ENROLLMENT"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDisable(false);
                      setMfaError("");
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 text-xs font-mono tracking-wider rounded-lg transition"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            )}

            {/* Inactive state */}
            {!mfaEnabled && !mfaSetupData && (
              <div className="bg-amber-950/10 border border-amber-500/20 rounded-xl p-5 flex flex-col sm:flex-row gap-4 items-start shadow-lg">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-sm tracking-wide text-amber-500">⚠️ MFA Protection is Inactive</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Your account is currently using single-factor password checks. We highly recommend activating MFA to protect sensitive cybersecurity assets and audit logging panels.
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={handleMfaSetup}
                      className="btn-accent px-4 py-2 text-xs font-mono tracking-wider font-bold rounded-lg flex items-center gap-2 hover:shadow-[0_0_12px_rgba(255,214,0,0.2)]"
                    >
                      <QrCode className="w-4 h-4" />
                      ENROLL AUTHENTICATOR APP
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Setup Wizard (Initiated) */}
            {!mfaEnabled && mfaSetupData && (
              <div className="space-y-5 bg-[#05080F]/40 border border-white/10 rounded-xl p-5">
                <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
                  <h4 className="font-bold text-sm tracking-wide text-slate-200">Configure Authenticator Credentials</h4>
                  <button 
                    onClick={() => setMfaSetupData(null)}
                    className="text-[10px] font-mono text-slate-500 hover:text-slate-300"
                  >
                    Cancel Wizard
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  {/* QR Code Container */}
                  <div className="bg-white p-3 rounded-lg flex items-center justify-center shrink-0 border-2 border-[#FFD600]/30 shadow-[0_0_12px_rgba(255,214,0,0.1)]">
                    <img 
                      src={mfaSetupData.qrDataUrl} 
                      alt="TOTP enrollment QR code" 
                      className="w-40 h-40 select-none animate-[pulse_3s_infinite]" 
                    />
                  </div>

                  <div className="space-y-3 text-xs text-slate-400">
                    <p className="font-bold text-slate-200">Step 1: Scan QR Code</p>
                    <p className="leading-relaxed">
                      Scan the barcode image with Google Authenticator, Microsoft Authenticator, Authy, or compatible client.
                    </p>
                    <p className="font-bold text-slate-200 pt-1">Step 2: Backup Manual Code (Alternative)</p>
                    <p className="leading-relaxed">
                      If scanning is unavailable, enter the following config key manually:
                    </p>
                    <div className="bg-[#05080F] border border-white/10 rounded px-2.5 py-1.5 font-mono text-[#FFD600] select-all tracking-wider text-center text-xs">
                      {mfaSetupData.manualKey}
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 my-3" />

                {/* Verification OTP submission */}
                <form onSubmit={handleMfaConfirm} className="space-y-3">
                  <p className="text-xs font-bold text-slate-200">Step 3: Verification Check</p>
                  <p className="text-xs text-slate-400">
                    Input the 6-digit dynamic code generated by your app to verify setup alignment.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={mfaToken}
                      onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ""))}
                      className="bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 text-center font-mono tracking-[4px] focus:outline-none focus:border-[#FFD600]/50 transition w-full sm:w-44"
                      placeholder="000000"
                    />
                    <button
                      type="submit"
                      disabled={verifyingMfa}
                      className="btn-accent px-5 py-2 rounded-lg text-xs font-mono tracking-wider font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_12px_rgba(255,214,0,0.25)] transition-all disabled:opacity-50"
                    >
                      {verifyingMfa ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          VERIFYING CODE...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          VERIFY & ENABLE PROTECTION
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: BRAND ASSET CENTER ── */}
        {activeTab === "assets" && (
          <div className="space-y-6">
            <div className="bg-[#FFD600]/5 border border-[#FFD600]/20 rounded-xl p-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-[#FFD600] shrink-0" />
              <p className="text-[11px] text-[#FFD600] font-mono leading-relaxed uppercase">
                Official Government Security Agency Assets. Authorized for incident reporting forms, security compliance logs, and administrative dispatches only.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Asset 1: LitSecure Primary Logo */}
              <div className="bg-[#05080F] border border-white/10 rounded-xl p-4 flex flex-col justify-between items-center group hover:border-[#FFD600]/30 transition duration-300">
                <div className="py-6 flex items-center justify-center select-none">
                  {PrimaryLogoSvg("svg-primary-logo", true)}
                </div>
                <div className="w-full border-t border-white/5 pt-3 mt-3 flex justify-between items-center">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">LitSecure Primary Logo</div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Vector SVG · Transparent</div>
                  </div>
                  <button
                    onClick={() => downloadSvgAsset("svg-primary-logo", "litsecure_primary_logo.svg")}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-[#FFD600] rounded-lg transition"
                    title="Download SVG"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Asset 2: LitSecure Yellow Logo */}
              <div className="bg-[#FFD600] border border-transparent rounded-xl p-4 flex flex-col justify-between items-center group hover:shadow-[0_0_15px_rgba(255,214,0,0.15)] transition duration-300">
                <div className="py-6 flex items-center justify-center select-none">
                  {PrimaryLogoSvg("svg-yellow-logo", false)}
                </div>
                <div className="w-full border-t border-slate-900/10 pt-3 mt-3 flex justify-between items-center">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">LitSecure Yellow Logo</div>
                    <div className="text-[9px] font-mono text-slate-800 uppercase">Vector SVG · High Contrast</div>
                  </div>
                  <button
                    onClick={() => downloadSvgAsset("svg-yellow-logo", "litsecure_yellow_logo.svg")}
                    className="p-2 bg-slate-900 hover:bg-slate-900/90 text-white rounded-lg transition"
                    title="Download SVG"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Asset 3: LitSecure Light Logo */}
              <div className="bg-white border border-transparent rounded-xl p-4 flex flex-col justify-between items-center group hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition duration-300">
                <div className="py-6 flex items-center justify-center select-none">
                  {LightLogoSvg("svg-light-logo")}
                </div>
                <div className="w-full border-t border-slate-200 pt-3 mt-3 flex justify-between items-center">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">LitSecure Light Logo</div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Vector SVG · Reversed</div>
                  </div>
                  <button
                    onClick={() => downloadSvgAsset("svg-light-logo", "litsecure_light_logo.svg")}
                    className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition"
                    title="Download SVG"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Asset 4: MACRA Logo */}
              <div className="bg-[#05080F] border border-white/10 rounded-xl p-4 flex flex-col justify-between items-center group hover:border-[#FFD600]/30 transition duration-300">
                <div className="py-2.5 h-[104px] flex items-center justify-center">
                  <img 
                    src="/macra_logo.png" 
                    alt="MACRA Official Logo" 
                    className="max-h-20 object-contain brightness-95" 
                  />
                </div>
                <div className="w-full border-t border-white/5 pt-3 mt-3 flex justify-between items-center">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">MACRA Authority Logo</div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">High Res PNG · Branding</div>
                  </div>
                  <a
                    href="/macra_logo.png"
                    download="macra_official_logo.png"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-[#FFD600] rounded-lg transition flex items-center justify-center"
                    title="Download PNG"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Asset 5: MACERT Security Seal */}
              <div className="bg-[#05080F] border border-white/10 rounded-xl p-4 flex flex-col justify-between items-center group hover:border-[#FFD600]/30 transition duration-300">
                <div className="py-2.5 h-[104px] flex items-center justify-center">
                  <img 
                    src="/macert_logo.png" 
                    alt="MACERT Official Seal" 
                    className="max-h-20 object-contain brightness-95" 
                  />
                </div>
                <div className="w-full border-t border-white/5 pt-3 mt-3 flex justify-between items-center">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">MACERT Security Seal</div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Official Seal PNG · Cybersecurity</div>
                  </div>
                  <a
                    href="/macert_logo.png"
                    download="macert_security_seal.png"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-[#FFD600] rounded-lg transition flex items-center justify-center"
                    title="Download PNG"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Asset 6: Malawi Coat of Arms */}
              <div className="bg-[#05080F] border border-white/10 rounded-xl p-4 flex flex-col justify-between items-center group hover:border-[#FFD600]/30 transition duration-300">
                <div className="py-2.5 h-[104px] flex items-center justify-center">
                  <img 
                    src="/coat_of_arms.jpg" 
                    alt="Malawi Coat of Arms" 
                    className="max-h-20 object-contain rounded brightness-90 border border-white/5" 
                  />
                </div>
                <div className="w-full border-t border-white/5 pt-3 mt-3 flex justify-between items-center">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">Malawi National Coat of Arms</div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Official Crest JPG</div>
                  </div>
                  <a
                    href="/coat_of_arms.jpg"
                    download="malawi_coat_of_arms.jpg"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-[#FFD600] rounded-lg transition flex items-center justify-center"
                    title="Download Crest"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
