import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";
import type { AdminStudent, Centre, Exam, QuestionRow } from "../../types";
import {
  BarChart3,
  Download,
  HelpCircle,
  LogOut,
  Building2,
  Menu,
  BookOpen,
  ChevronDown,
  SlidersHorizontal,
  Layers,
  Waypoints,
  Library,
} from "lucide-react";
import MonitorTab from "./tabs/MonitorTab";
import ImportTab from "./tabs/ImportTab";
import QuestionsTab from "./tabs/QuestionsTab";
import CentresTab from "./tabs/CentresTab";
import StreamsTab from "./tabs/StreamsTab";
import SetsTab from "./tabs/SetsTab";
import ExamsTab from "./tabs/ExamsTab";
import SettingsTab from "./tabs/SettingsTab";
import DecorativeBackground from "../../components/DecorativeBackground";

type Tab =
  | "monitor"
  | "import"
  | "questions"
  | "centres"
  | "streams"
  | "sets"
  | "exams"
  | "settings";

export interface ActivityEvent {
  id: string;
  type: "strike" | "disconnect" | "submitted" | "status_change";
  roll: string;
  name?: string;
  name_ar?: string;
  detail: string;
  at: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const adminAuth = useAuthStore((s) => s.adminAuth);
  const clearAdmin = useAuthStore((s) => s.clearAdmin);
  const isAdmin = adminAuth?.role === "admin";

  const [tab, setTab] = useState<Tab>("monitor");
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examPickerOpen, setExamPickerOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [viewingMap, setViewingMap] = useState<Record<string, number>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [disconnectedMap, setDisconnectedMap] = useState<
    Record<string, { reason: string; at: string }>
  >({});
  const wsRef = useRef<WebSocket | null>(null);
  const handleWsMessageRef = useRef<(msg: Record<string, unknown>) => void>(() => {});

  const selectedExam = exams.find((e) => e.id === selectedExamId) ?? null;

  useEffect(() => {
    if (!adminAuth) {
      navigate("/admin", { replace: true });
      return;
    }
    loadExams().then((list) => {
      const firstActive =
        list.find((e) => e.status === "active") ?? list[0] ?? null;
      const id = firstActive?.id ?? null;
      setSelectedExamId(id);
      loadStudentsAndCentres(id);
    });
    api.questions.list().then(setQuestions).catch(() => {});
    connectWs();

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const token = localStorage.getItem("token");
      if (!token) {
        clearAdmin();
        navigate("/admin", { replace: true });
        return;
      }
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.exp * 1000 < Date.now()) {
          clearAdmin();
          navigate("/admin", { replace: true });
        }
      } catch {
        clearAdmin();
        navigate("/admin", { replace: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      wsRef.current?.close();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const loadExams = async (): Promise<Exam[]> => {
    if (!isAdmin) return [];
    try {
      const list = await api.exams.list();
      setExams(list);
      return list;
    } catch {
      return [];
    }
  };

  const loadStudentsAndCentres = async (examId: number | null) => {
    try {
      const [studs, centresData] = await Promise.all([
        api.admin.getStudents(examId ?? undefined),
        api.admin.getCentres(),
      ]);
      setStudents(studs);
      setCentres(centresData);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdmin();
        navigate("/admin", { replace: true });
      }
    }
  };

  const loadAll = useCallback(() => {
    loadStudentsAndCentres(selectedExamId);
    loadExams();
  }, [selectedExamId]);

  // Re-load students when selected exam changes
  useEffect(() => {
    if (selectedExamId !== null) {
      loadStudentsAndCentres(selectedExamId);
    }
  }, [selectedExamId]);

  const connectWs = () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/dashboard?token=${token}`,
    );
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWs, 3000);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleWsMessageRef.current(msg);
      } catch {}
    };
  };

  const addActivity = useCallback((event: ActivityEvent) => {
    setActivityFeed((prev) => [event, ...prev].slice(0, 200));
  }, []);

  const handleWsMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.type === "student_viewing") {
        setViewingMap((prev) => ({
          ...prev,
          [msg.roll as string]: msg.question_index as number,
        }));
        return;
      }

      if (msg.type === "student_disconnect") {
        const roll = msg.roll as string;
        const reason = msg.reason as string;
        const at = new Date().toISOString();
        setDisconnectedMap((prev) => ({ ...prev, [roll]: { reason, at } }));
        setStudents((prev) => {
          const s = prev.find((s) => s.roll_number === roll);
          addActivity({
            id: Math.random().toString(36).slice(2),
            type: "disconnect",
            roll,
            name: s?.name_en,
            name_ar: s?.name_ar,
            detail: reason,
            at,
          });
          return prev;
        });
        return;
      }

      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.roll_number === msg.roll);
        if (idx === -1) {
          loadAll();
          return prev;
        }
        const updated = [...prev];
        const s = { ...updated[idx] };
        const at = new Date().toISOString();

        if (msg.type === "answer_saved") {
          const qIdStr = String(msg.q_id);
          const wasAnswered = !!(s.answers?.[qIdStr]?.trim());
          if (!wasAnswered) {
            s.answered_count = Math.min(
              (s.answered_count || 0) + 1,
              s.total_questions || 100,
            );
          }
          if (msg.q_id != null) {
            s.answers = { ...(s.answers || {}), [qIdStr]: "✓" };
          }
          setDisconnectedMap((prev) => {
            const next = { ...prev };
            delete next[s.roll_number];
            return next;
          });
        } else if (msg.type === "strike") {
          s.strikes = msg.strikes as number;
          s.status = msg.status as AdminStudent["status"];
          const eventLabel: Record<string, string> = {
            tab_switch: "Tab switch",
            window_blur: "Window blur",
            fullscreen_exit: "Fullscreen exited",
            devtools_open: "DevTools opened",
            right_click: "Right-click attempt",
            copy_attempt: "Copy/paste attempt",
            keyboard_shortcut: "Blocked shortcut",
          };
          const evtKey = msg.event as string;
          addActivity({
            id: Math.random().toString(36).slice(2),
            type: "strike",
            roll: s.roll_number,
            name: s.name_en,
            name_ar: s.name_ar,
            detail: `Strike ${s.strikes} — ${eventLabel[evtKey] ?? evtKey}`,
            at,
          });
        } else if (msg.type === "submitted") {
          s.status = "submitted";
          s.score = msg.score as number;
          addActivity({
            id: Math.random().toString(36).slice(2),
            type: "submitted",
            roll: s.roll_number,
            name: s.name_en,
            name_ar: s.name_ar,
            detail: `Submitted · Score: ${Number(msg.score).toFixed(1)}`,
            at,
          });
        } else if (msg.type === "status_change") {
          s.status = msg.status as AdminStudent["status"];
          if (msg.status === "active") {
            addActivity({
              id: Math.random().toString(36).slice(2),
              type: "status_change",
              roll: s.roll_number,
              name: s.name_en,
              name_ar: s.name_ar,
              detail: "Started exam",
              at,
            });
          }
        }
        updated[idx] = s;
        return updated;
      });
    },
    [addActivity, loadAll],
  );

  handleWsMessageRef.current = handleWsMessage;

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
  }[] = [
    { id: "monitor", label: "Hall", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "exams", label: "Exams", icon: <BookOpen className="w-4 h-4" />, adminOnly: true },
    { id: "centres", label: "Centres", icon: <Building2 className="w-4 h-4" />, adminOnly: true },
    { id: "streams", label: "Streams", icon: <Waypoints className="w-4 h-4" />, adminOnly: true },
    { id: "sets", label: "Sets", icon: <Library className="w-4 h-4" />, adminOnly: true },
    { id: "import", label: "Import Students", icon: <Download className="w-4 h-4" />, adminOnly: true },
    { id: "questions", label: "Questions", icon: <HelpCircle className="w-4 h-4" />, adminOnly: true },
    { id: "settings", label: "Settings", icon: <SlidersHorizontal className="w-4 h-4" />, adminOnly: true },
  ];

  const navTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden bg-black/50"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Branded Background Decorations */}
      <DecorativeBackground variation={tab} />

      {/* Sidebar */}
      <aside
        className={`w-[260px] bg-brand-950 text-stone-100 flex flex-col fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out shadow-2xl ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 bg-gradient-to-b from-brand-900 to-brand-950`}
      >
        {/* Sidebar Header */}
        <div className="px-6 py-8 border-b border-white/5 relative overflow-hidden group">
          {/* Subtle background glow */}
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-gold-500/10 blur-3xl rounded-full group-hover:bg-gold-500/20 transition-all duration-700" />
          
          <div className="relative flex flex-col items-center text-center">
            <div className="bg-white/5 p-3 rounded-lg mb-4 shadow-inner backdrop-blur-sm border border-white/10">
              <img 
                src="/logo.png" 
                alt="Al Jamia" 
                className="h-14 w-auto object-contain brightness-0 invert" 
              />
            </div>
            <h1 className="text-white font-extrabold text-[11px] tracking-[0.2em] uppercase leading-none mb-1.5 drop-shadow-md">
              Al Jamia Al Islamiya
            </h1>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-1 h-1 rounded-full bg-gold-500" />
              <p className="text-gold-500/90 text-[10px] uppercase tracking-[0.15em] font-bold">
                {adminAuth?.role} PORTAL
              </p>
            </div>
          </div>
        </div>

        {/* Exam selector */}
        {isAdmin && exams.length > 0 && (
          <div className="px-3 py-2 border-b border-stone-800 relative">
            <button
              onClick={() => setExamPickerOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 flex-shrink-0 text-stone-400" />
              <span className="flex-1 text-left truncate">
                {selectedExam?.name ?? "Select exam"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-stone-500" />
            </button>
            {examPickerOpen && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-stone-800 border border-stone-700 shadow-xl z-50 max-h-48 overflow-y-auto">
                {exams.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setSelectedExamId(e.id);
                      setExamPickerOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-stone-700/50 last:border-0 ${
                      e.id === selectedExamId
                        ? "bg-brand-900/50 text-brand-300"
                        : "text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    <p className="font-medium truncate">{e.name}</p>
                    <p className="text-stone-500 font-mono text-[10px] mt-0.5 uppercase">{e.code} · {e.status}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-300/50 font-bold px-4 mb-4 select-none">
            Administration
          </p>
          {navTabs.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3.5 px-4 py-3 text-sm font-semibold transition-all duration-200 group relative
                  ${isActive
                    ? "text-white bg-white/10 rounded-lg"
                    : "text-brand-100/60 hover:text-white hover:bg-white/5 rounded-lg"
                  }`}
              >
                {isActive && (
                  <div className="absolute left-0 w-1 h-5 bg-gold-500 rounded-r-full" />
                )}
                <span className={`transition-colors duration-200 ${isActive ? "text-gold-400" : "group-hover:text-gold-400/80"}`}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-stone-800 px-5 py-4 mt-auto">
          {/* <div className="flex items-center gap-2 mb-4">
            <span
              className={`w-2 h-2 rounded-full ${wsConnected ? "bg-teal-500" : "bg-rose-500"}`}
            />
            <span className="text-xs text-stone-400">
              {wsConnected ? "Connected" : "Disconnected"}
            </span>
          </div> */}
          <button
            onClick={() => {
              clearAdmin();
              navigate("/admin");
            }}
            className="flex items-center gap-2 text-stone-400 hover:text-white hover:bg-stone-700 text-sm font-medium transition-colors w-full px-3 py-2 -mx-3 rounded"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Page wrapper */}
      <div className="md:ml-[260px] min-h-screen flex flex-col bg-stone-50/50">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 bg-brand-900/90 backdrop-blur-md text-white flex items-center gap-3 px-4 h-16 border-b border-white/10 flex-shrink-0 shadow-lg">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl text-white hover:bg-white/10 transition-colors border border-white/10"
          >
            <Menu className="w-5 h-5 text-gold-500" />
          </button>
          <div className="flex flex-col">
            <span className="font-black text-[11px] tracking-[0.25em] uppercase leading-none mb-1 text-white">Al Jamia</span>
            <span className="text-gold-500 text-[9px] font-black uppercase tracking-widest">Dash Portal</span>
          </div>
          <div className="ml-auto flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
            <div className="text-right">
              <p className="text-white font-black text-[10px] leading-none uppercase">{adminAuth?.username}</p>
              <p className="text-gold-500/60 text-[8px] uppercase tracking-widest mt-0.5 font-black">{adminAuth?.role}</p>
            </div>
            <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.6)]" : "bg-rose-400"}`} />
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden relative z-10">
          {tab === "monitor" && (
            <MonitorTab
              students={students}
              centres={centres}
              exams={exams}
              onRefresh={loadAll}
              isAdmin={isAdmin}
              viewingMap={viewingMap}
              activityFeed={activityFeed}
              disconnectedMap={disconnectedMap}
              passMark={selectedExam?.pass_mark ?? 0}
              questions={questions}
              wsConnected={wsConnected}
            />
          )}
          {tab === "exams" && isAdmin && (
            <ExamsTab
              onExamSelect={(id) => {
                setSelectedExamId(id);
                setTab("monitor");
              }}
            />
          )}
          {tab === "centres" && isAdmin && (
            <CentresTab centres={centres} onRefresh={loadAll} />
          )}
          {tab === "streams" && isAdmin && <StreamsTab />}
          {tab === "sets" && isAdmin && <SetsTab />}
          {tab === "import" && isAdmin && (
            <ImportTab
              centres={centres}
              onImported={loadAll}
              examId={selectedExamId ?? undefined}
              examName={selectedExam?.name}
            />
          )}
          {tab === "questions" && isAdmin && <QuestionsTab />}
          {tab === "settings" && isAdmin && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}
