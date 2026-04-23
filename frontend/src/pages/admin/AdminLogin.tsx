import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";

export default function AdminLogin() {
  const navigate = useNavigate();
  const setAdminAuth = useAuthStore((s) => s.setAdminAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.admin.login(username.trim(), password);
      setAdminAuth({
        token: res.token,
        role: res.role,
        centre_id: res.centre_id,
        username: res.username,
      });
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-950 flex flex-col items-center justify-center p-5 font-sans relative overflow-hidden">
      {/* Background blobs (matching StudentLogin) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-brand-700/20 rounded-full blur-[130px]" />
        <div className="absolute top-1/2 -right-32 w-[500px] h-[500px] bg-gold-500/8 rounded-full blur-[110px]" />
        <div className="absolute -bottom-32 left-1/4 w-[550px] h-[550px] bg-brand-800/25 rounded-full blur-[150px]" />
      </div>

      {/* Institution Header */}
      <div className="relative z-10 mb-8 text-center flex flex-col items-center">
        <div className="mb-5 bg-white/8 p-4 border border-white/15 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl">
          <img
            src="/logo.png"
            alt="Al Jamia Al Islamiya"
            className="h-16 sm:h-20 w-auto object-contain brightness-0 invert"
          />
        </div>
        <h1 className="text-white font-black text-xl sm:text-2xl tracking-tight uppercase leading-none">
          Al Jamia Al Islamiya
        </h1>
        <div className="flex items-center gap-3 mt-2.5">
          <div className="h-px w-10 bg-gold-500/50" />
          <p className="text-gold-400 text-[9px] uppercase tracking-[0.3em] font-bold">
            Administrative Access Portal
          </p>
          <div className="h-px w-10 bg-gold-500/50" />
        </div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        {/* Gold top accent */}
        <div className="h-1 bg-gradient-to-r from-gold-700 via-gold-400 to-gold-700 shadow-[0_2px_12px_rgba(182,142,74,0.4)]" />
        <div className="bg-white">
          <div className="px-7 pt-6 pb-7">
            <div className="mb-5 border-b border-stone-100 pb-4">
              <p className="text-brand-800 font-black text-xs uppercase tracking-[0.15em] text-center">Administrative Login</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-stone-500 mb-2">
                  Admin Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. administrator"
                  autoComplete="username"
                  className="w-full border-2 border-stone-200 px-4 py-3 text-sm text-stone-900 bg-stone-50 placeholder-stone-300 focus:border-brand-700 focus:bg-white outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-stone-500 mb-2">
                  Secure Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full border-2 border-stone-200 px-4 py-3 pr-11 text-sm text-stone-900 bg-stone-50 placeholder-stone-300 focus:border-brand-700 focus:bg-white outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-brand-700 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 px-4 py-3 text-sm text-rose-800 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 transition-all flex items-center justify-center gap-2.5 uppercase tracking-[0.2em] text-[11px] shadow-lg shadow-brand-900/40 active:scale-[0.98] mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking Credentials...
                  </>
                ) : (
                  <>
                    Secure Access
                    <ShieldCheck className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center mt-8">
              <a
                href="/"
                className="inline-flex items-center gap-2 text-brand-700 hover:text-brand-800 font-bold text-[10px] uppercase tracking-widest transition-all group"
              >
                <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> 
                Student Access Point
              </a>
            </div>
          </div>
        </div>
      </div>

      <p className="relative z-10 text-brand-300/25 text-[9px] mt-8 uppercase tracking-widest font-bold">
        Al Jamia Al Islamiya &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
