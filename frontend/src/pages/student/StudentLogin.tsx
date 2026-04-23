import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";
import { useExamStore } from "../../stores/examStore";
import { Loader2, Eye, EyeOff, Clock } from "lucide-react";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0)
    return `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function StudentLogin() {
  const navigate = useNavigate();
  const setStudentAuth = useAuthStore((s) => s.setStudentAuth);
  const resetExam = useExamStore((s) => s.reset);

  const [roll, setRoll] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [examStartTime, setExamStartTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState("");
  const [examStarted, setExamStarted] = useState(false);

  useEffect(() => {
    resetExam();
    api.student
      .publicConfig()
      .then((cfg) => {
        if (cfg.test_mode) {
          setExamStarted(true);
        } else if (cfg.exam_start_time) {
          const st = new Date(cfg.exam_start_time);
          setExamStartTime(st);
          setExamStarted(st <= new Date());
        } else {
          setExamStarted(false);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!examStartTime) return;
    const tick = () => {
      const diff = examStartTime.getTime() - Date.now();
      if (diff <= 0) {
        setExamStarted(true);
        setCountdown("");
      } else {
        setCountdown(formatCountdown(diff));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [examStartTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!roll.trim() || !password.trim()) {
      setError("Please enter your roll number and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.student.login(roll.trim().toUpperCase(), password.trim());
      setStudentAuth({ token: res.token, student: res.student });
      if (res.student.status === "submitted" || res.student.status === "flagged") {
        navigate("/submitted");
      } else {
        navigate("/exam");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          try {
            const detail = JSON.parse(
              err.message.replace(/'/g, '"').replace(/True/g, "true").replace(/False/g, "false"),
            );
            if (detail?.code === "EXAM_NOT_STARTED" && detail.exam_start_time) {
              setExamStartTime(new Date(detail.exam_start_time));
              setExamStarted(false);
            } else {
              setError(err.message);
            }
          } catch {
            setError(err.message);
          }
        } else {
          setError(err.message);
        }
      } else {
        setError("Connection error. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-950 flex flex-col items-center justify-center p-5 font-sans relative overflow-hidden">
      {/* Background blobs */}
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
            Admission Examination Portal
          </p>
          <div className="h-px w-10 bg-gold-500/50" />
        </div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        {/* Gold top accent */}
        <div className="h-1 bg-gradient-to-r from-gold-700 via-gold-400 to-gold-700 shadow-[0_2px_12px_rgba(182,142,74,0.4)]" />
        <div className="bg-white">

          {/* Countdown banner */}
          {!examStarted && examStartTime && (
            <div className="bg-amber-50 border-b-2 border-amber-200 px-6 py-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <p className="text-amber-700 text-[9px] font-black uppercase tracking-[0.2em]">Examination Opens In</p>
              </div>
              <p className="text-amber-900 text-3xl font-mono font-black tabular-nums">{countdown || "..."}</p>
              <p className="text-amber-600 text-[9px] mt-1.5 font-medium">
                {examStartTime.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                {" · "}
                {examStartTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          )}

          {examStarted && (
            <div className="bg-emerald-50 border-b-2 border-emerald-200 px-6 py-2.5 flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              <p className="text-emerald-800 text-[10px] font-black uppercase tracking-[0.2em]">
                Examination Now Open
              </p>
            </div>
          )}

          <div className="px-7 pt-6 pb-7">
            <div className="mb-5 border-b border-stone-100 pb-4">
              <p className="text-brand-800 font-black text-xs uppercase tracking-[0.15em] text-center">Candidate Login</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-stone-500 mb-2">
                  Roll Number
                </label>
                <input
                  type="tel"
                  value={roll}
                  onChange={(e) => setRoll(e.target.value.trim())}
                  placeholder="Your registered phone number"
                  autoComplete="username"
                  inputMode="numeric"
                  className="w-full border-2 border-stone-200 px-4 py-3 text-sm text-stone-900 bg-stone-50 placeholder-stone-300 focus:border-brand-700 focus:bg-white outline-none transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-stone-500 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="As announced by invigilator"
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
                disabled={loading || !examStarted}
                className="w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 transition-all flex items-center justify-center gap-2.5 uppercase tracking-[0.2em] text-[11px] shadow-lg shadow-brand-900/40 active:scale-[0.98] mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Authenticating...
                  </>
                ) : !examStarted ? (
                  "Waiting for Portal..."
                ) : (
                  "Enter Examination"
                )}
              </button>
            </form>

            <p className="text-stone-400 text-[10px] text-center mt-5 leading-relaxed">
              Roll number is your registered phone number.<br />
              Password format announced by the invigilator.
            </p>
          </div>
        </div>
      </div>

      <p className="relative z-10 text-brand-300/25 text-[9px] mt-8 uppercase tracking-widest font-bold">
        Al Jamia Al Islamiya &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
