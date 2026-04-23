import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../../api/client";
import type { AdminStudent, Centre, ExamConfig } from "../../../types";
import type { ActivityEvent } from "../Dashboard";
import {
  AlertTriangle,
  X,
  Download,
  Loader2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  LayoutGrid,
  List,
  Clock,
  WifiOff,
  Users,
  Building2,
  Activity,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { StudentDetailModal, STATUS_STYLES, STATUS_DOT, exportStudentsCsv, getSectionSummary } from "./StudentDetail";

// ── Utilities ────────────────────────────────────────────────────────────────
function timeSince(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function formatHMS(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function lateMins(startTime: string | null, examStartTime: string | null): number | null {
  if (!startTime || !examStartTime) return null;
  const diff = Math.floor((new Date(startTime).getTime() - new Date(examStartTime).getTime()) / 60000);
  return diff > 0 ? diff : null;
}

// ── Exam Countdown Banner ────────────────────────────────────────────────────
function ExamCountdownBanner({ config }: { config: ExamConfig | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!config?.exam_start_time) return null;

  const startMs = new Date(config.exam_start_time).getTime();
  const endMs = startMs + config.exam_duration_minutes * 60000;
  const beforeExam = now < startMs;
  const afterExam = now >= endMs;
  const duringExam = !beforeExam && !afterExam;

  if (afterExam) {
    return (
      <div className="mb-6 bg-stone-100 border border-stone-200 px-5 py-3 flex items-center gap-3">
        <Clock className="w-4 h-4 text-stone-400 flex-shrink-0" />
        <span className="text-stone-600 text-sm font-medium">Exam has ended</span>
        <span className="text-stone-400 text-xs ml-auto">
          Started {new Date(startMs).toLocaleTimeString()} · Ended {new Date(endMs).toLocaleTimeString()}
        </span>
      </div>
    );
  }

  if (beforeExam) {
    return (
      <div className="mb-6 bg-amber-50 border border-amber-200 px-5 py-3 flex items-center gap-4">
        <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <div>
          <span className="text-amber-800 text-xs font-bold uppercase tracking-widest">Exam starts in</span>
          <span className="text-amber-900 text-xl font-mono font-bold tabular-nums ml-3">{formatHMS(startMs - now)}</span>
        </div>
        <span className="text-amber-600 text-xs ml-auto">
          {new Date(startMs).toLocaleString()} · {config.exam_duration_minutes} min
        </span>
      </div>
    );
  }

  // During exam
  const remaining = endMs - now;
  const elapsed = now - startMs;
  const pct = Math.min(100, (elapsed / (config.exam_duration_minutes * 60000)) * 100);
  const isWarning = remaining < 15 * 60 * 1000;

  return (
    <div className={`mb-6 border px-5 py-3 ${isWarning ? "bg-rose-50 border-rose-300" : "bg-teal-50 border-teal-200"}`}>
      <div className="flex items-center gap-4 mb-2">
        <Clock className={`w-4 h-4 flex-shrink-0 ${isWarning ? "text-rose-500" : "text-teal-500"}`} />
        <div className="flex-1">
          <span className={`text-xs font-bold uppercase tracking-widest ${isWarning ? "text-rose-700" : "text-teal-700"}`}>
            {isWarning ? "⚠ Exam ending soon — " : "Exam in progress — "}
          </span>
          <span className={`text-xl font-mono font-bold tabular-nums ${isWarning ? "text-rose-900" : "text-teal-900"}`}>
            {formatHMS(remaining)} remaining
          </span>
        </div>
        <span className="text-xs text-stone-400">Ends {new Date(endMs).toLocaleTimeString()}</span>
      </div>
      <div className="h-1.5 bg-stone-200 overflow-hidden">
        <div
          className={`h-full transition-all ${isWarning ? "bg-rose-500" : "bg-teal-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Centre Summary Panel ─────────────────────────────────────────────────────
function CentreSummary({ students, centres }: { students: AdminStudent[]; centres: Centre[] }) {
  if (centres.length <= 1) return null;

  const rows = centres.map((c) => {
    const cs = students.filter((s) => s.centre_id === c.id);
    return {
      name: c.name_en,
      total: cs.length,
      active: cs.filter((s) => s.status === "active").length,
      submitted: cs.filter((s) => s.status === "submitted" || s.status === "flagged").length,
      pending: cs.filter((s) => s.status === "pending").length,
      flagged: cs.filter((s) => s.status === "flagged").length,
    };
  }).filter((r) => r.total > 0);

  if (rows.length === 0) return null;

  return (
    <div className="mb-8 bg-white border border-stone-200 shadow-sm rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-stone-100 flex items-center gap-2.5 bg-stone-50/50">
        <Building2 className="w-4 h-4 text-brand-600" />
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-600">Centre Performance Breakdown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/30">
              <th className="px-5 py-3 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Centre</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold text-brand-600 uppercase tracking-widest">Active</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold text-amber-500 uppercase tracking-widest">Pending</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Submitted</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold text-rose-500 uppercase tracking-widest">Flagged</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/80 transition-colors">
                <td className="px-5 py-3.5 font-bold text-stone-800">{r.name}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-stone-600 font-medium">{r.total}</td>
                <td className="px-5 py-3.5 text-right tabular-nums font-bold text-brand-600">{r.active}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-amber-600 font-medium">{r.pending}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-stone-600 font-medium">{r.submitted}</td>
                <td className="px-5 py-3.5 text-right tabular-nums font-bold text-rose-600">{r.flagged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pending Students Panel ───────────────────────────────────────────────────
function PendingPanel({ students }: { students: AdminStudent[] }) {
  const [expanded, setExpanded] = useState(false);
  const pending = students.filter((s) => s.status === "pending");
  if (pending.length === 0) return null;

  const PREVIEW = 5;
  const shown = expanded ? pending : pending.slice(0, PREVIEW);

  const toggleExpanded = () => {
    const scrollY = window.scrollY;
    setExpanded((e) => !e);
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior }));
  };

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 shadow-sm">
      <button
        onClick={toggleExpanded}
        className="w-full px-4 py-3 border-b border-amber-200 flex items-center gap-2 hover:bg-amber-100/50 transition-colors text-left"
      >
        <Users className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-xs font-bold uppercase tracking-widest text-amber-700 flex-1">
          Not Started — {pending.length} student{pending.length !== 1 ? "s" : ""}
        </span>
        <span className="text-amber-500 text-sm">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-amber-200 bg-amber-100/40">
                <th className="px-4 py-2 text-left font-semibold text-amber-700 uppercase tracking-wider">Name</th>
                <th className="px-4 py-2 text-left font-semibold text-amber-700 uppercase tracking-wider">Roll</th>
                <th className="px-4 py-2 text-left font-semibold text-amber-700 uppercase tracking-wider">Centre</th>
                <th className="px-4 py-2 text-left font-semibold text-amber-700 uppercase tracking-wider">Stream</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {shown.map((s) => (
                <tr key={s.roll_number} className="hover:bg-amber-100/30">
                  <td className="px-4 py-2">
                    <p className="text-amber-900 font-bold">{s.name_en}</p>
                    {s.name_ar && <p className="text-amber-700 font-arabic text-sm" dir="rtl">{s.name_ar}</p>}
                  </td>
                  <td className="px-4 py-2 font-mono text-amber-600">{s.roll_number}</td>
                  <td className="px-4 py-2 text-amber-700">{s.centre_name || "—"}</td>
                  <td className="px-4 py-2 text-amber-700">{s.stream || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pending.length > PREVIEW && (
            <div className="px-4 py-2 border-t border-amber-200 text-center">
              <button
                onClick={toggleExpanded}
                className="text-xs text-amber-600 hover:text-amber-900 font-medium"
              >
                Collapse
              </button>
            </div>
          )}
        </div>
      )}
      {!expanded && (
        <div className="px-4 py-2.5 flex items-center gap-2">
          {shown.map((s) => (
            <span key={s.roll_number} className="text-xs text-amber-700 font-mono bg-white border border-amber-200 px-2 py-0.5">
              {s.roll_number}
            </span>
          ))}
          {pending.length > PREVIEW && (
            <button
              onClick={toggleExpanded}
              className="text-xs text-amber-600 hover:text-amber-900 font-semibold ml-1"
            >
              +{pending.length - PREVIEW} more →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Activity Feed ────────────────────────────────────────────────────────────
const ACTIVITY_STYLES: Record<ActivityEvent["type"], { bg: string; text: string; dot: string }> = {
  strike: { bg: "bg-rose-50 border-rose-200", text: "text-rose-800", dot: "bg-rose-500" },
  disconnect: { bg: "bg-orange-50 border-orange-200", text: "text-orange-800", dot: "bg-orange-500" },
  submitted: { bg: "bg-teal-50 border-teal-200", text: "text-teal-800", dot: "bg-teal-500" },
  status_change: { bg: "bg-brand-50 border-brand-200", text: "text-brand-800", dot: "bg-brand-500" },
};

function ActivityFeed({ feed, onInspect }: { feed: ActivityEvent[]; onInspect: (roll: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  if (feed.length === 0) return null;
  const toggleCollapsed = () => {
    const scrollY = window.scrollY;
    setCollapsed((c) => !c);
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior }));
  };
  return (
    <div className="mb-6 bg-white border border-stone-200 shadow-sm">
      <button
        onClick={toggleCollapsed}
        className="w-full px-4 py-3 border-b border-stone-100 flex items-center gap-2 hover:bg-stone-50 transition-colors text-left"
      >
        <Activity className="w-4 h-4 text-stone-400" />
        <span className="text-xs font-bold uppercase tracking-widest text-stone-500 flex-1">
          Activity Feed
        </span>
        <span className="text-xs text-stone-400">{feed.length} events</span>
        <span className="text-stone-400 text-sm ml-2">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div className="max-h-64 overflow-y-auto divide-y divide-stone-50">
          {feed.map((ev) => {
            const style = ACTIVITY_STYLES[ev.type];
            return (
              <div key={ev.id} className={`flex items-start gap-3 px-4 py-2.5 border-l-2 ${style.bg}`}>
                <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-bold ${style.text}`}>
                    {ev.name || ev.roll}
                  </span>
                  {ev.name_ar && (
                    <span className={`text-sm font-arabic ml-2 ${style.text}`} dir="rtl">
                      {ev.name_ar}
                    </span>
                  )}
                  <span className="text-stone-400 font-mono text-[10px] ml-1.5">{ev.roll}</span>
                  <p className="text-xs text-stone-600 mt-0.5">{ev.detail}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-stone-400 tabular-nums">{formatTime(ev.at)}</span>
                  <button
                    onClick={() => onInspect(ev.roll)}
                    className="text-[10px] font-semibold text-stone-500 border border-stone-200 px-2 py-0.5 hover:bg-stone-100 uppercase tracking-wider transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-stone-900",
  accent = "from-brand-800 to-brand-700",
  iconBg = "bg-brand-50",
  iconColor = "text-brand-700",
  icon: Icon,
  className = "",
}: {
  label: string;
  value: string | number;
  color?: string;
  accent?: string;
  iconBg?: string;
  iconColor?: string;
  icon?: any;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-stone-200 shadow-sm overflow-hidden group hover:shadow-md transition-all duration-300 ${className}`}>
      <div className={`h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          {Icon && (
            <div className={`p-2 ${iconBg} transition-colors`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
          )}
          <p className="text-[10px] uppercase tracking-[0.15em] text-stone-400 font-bold">
            {label}
          </p>
        </div>
        <p className={`text-3xl font-extrabold tabular-nums tracking-tight ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  col,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  col: string;
  sort: { col: string; dir: "asc" | "desc" };
  onSort: (col: string) => void;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider cursor-pointer select-none hover:text-stone-900 transition-colors ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="flex flex-col -space-y-0.5 ml-0.5">
          <ChevronUp
            className={`w-2.5 h-2.5 ${active && sort.dir === "asc" ? "text-brand-600" : "text-stone-300"}`}
          />
          <ChevronDown
            className={`w-2.5 h-2.5 ${active && sort.dir === "desc" ? "text-brand-600" : "text-stone-300"}`}
          />
        </span>
      </span>
    </th>
  );
}

// ── Reset All Modal ──────────────────────────────────────────────────────────
function ResetAllModal({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.replace(/\s+/g, " ").trim() === "RESET ALL";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-stone-200 shadow-2xl p-6 max-w-sm w-full">
        <div className="w-12 h-12 bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-rose-600" />
        </div>
        <h2 className="text-stone-900 text-lg font-semibold text-center mb-1">
          Reset All Results
        </h2>
        <p className="text-stone-500 text-sm text-center mb-5">
          This will wipe progress, answers, and scores for all{" "}
          <span className="font-bold text-stone-900">{count}</span> student
          {count !== 1 ? "s" : ""}. This cannot be undone.
        </p>
        <div className="mb-5">
          <p className="text-xs text-stone-500 mb-2 font-medium">
            Type <span className="font-mono font-bold text-rose-700">RESET ALL</span> to confirm:
          </p>
          <input
            autoFocus
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            className="w-full border border-stone-300 px-3 py-2.5 text-sm font-mono text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            placeholder="RESET ALL"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="h-10 border border-stone-300 text-stone-700 font-medium text-sm hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className="h-10 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Alert component ──────────────────────────────────────────────────────────
interface StrikeAlert {
  id: string;
  roll_number: string;
  name: string;
  strikes: number;
  time: number;
}

// ── Student card (grid view) ─────────────────────────────────────────────────
function StudentCard({
  student,
  currentQIndex,
  questions = [],
  onClick,
}: {
  student: AdminStudent;
  currentQIndex?: number;
  questions?: import("../../../types").QuestionRow[];
  onClick: () => void;
}) {
  const qOrder = student.question_order ?? [];
  const total = student.total_questions || qOrder.length;
  const isLive = student.status === "active" || student.status === "flagged";

  return (
    <div
      onClick={onClick}
      className={`bg-white border cursor-pointer hover:shadow-md transition-all p-4 select-none ${student.status === "flagged"
        ? "border-rose-300 bg-rose-50/30"
        : student.status === "active"
          ? "border-brand-300 bg-brand-50/20"
          : "border-stone-200"
        }`}
    >
      {/* Status + strikes row */}
      <div className="flex items-center justify-between mb-2.5">
        <span
          className={`text-xs font-bold uppercase tracking-widest px-2 py-0.5 border ${STATUS_STYLES[student.status] ?? ""}`}
        >
          {student.status}
        </span>
        <div className="flex items-center gap-1.5">
          {student.strikes > 0 && (
            <span className="text-rose-500 text-sm font-bold leading-none">
              {"⚡".repeat(Math.min(student.strikes, 3))}
            </span>
          )}
          {student.status === "submitted" && student.score != null && (
            <span className="text-sm font-bold text-stone-700">
              {Number(student.score).toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Name + roll */}
      <div className="min-w-0">
        <p className="font-bold text-stone-900 text-sm leading-tight truncate">
          {student.name_en}
        </p>
        {student.name_ar && (
          <p className="font-arabic text-stone-700 text-base leading-tight truncate mt-1" dir="rtl">
            {student.name_ar}
          </p>
        )}
      </div>
      <p className="text-stone-400 text-xs font-mono mt-0.5 truncate">
        {student.roll_number} · Set {student.paper_set}
      </p>

      {/* Live question indicator */}
      {isLive && currentQIndex !== undefined && total > 0 && (
        <div className="flex items-center justify-between mt-2.5 text-xs text-stone-500">
          <span className="font-semibold text-brand-600">
            Q {currentQIndex + 1} / {total}
          </span>
          <span>{student.answered_count} answered</span>
        </div>
      )}

      {/* Answer dot grid */}
      {total > 0 && student.status !== "pending" && qOrder.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-2">
          {qOrder.map((qid, i) => {
            const answered = !!(student.answers?.[String(qid)]?.trim());
            const isCurrent = isLive && i === currentQIndex;
            return (
              <div
                key={i}
                className={`w-2 h-2 rounded-sm flex-shrink-0 ${isCurrent
                  ? "bg-brand-500 ring-1 ring-offset-0 ring-brand-300"
                  : answered
                    ? "bg-emerald-400"
                    : "bg-stone-200"
                  }`}
              />
            );
          })}
        </div>
      )}

      {/* Pending placeholder */}
      {student.status === "pending" && (
        <p className="text-xs text-stone-400 mt-2">Waiting to start</p>
      )}

      {/* Section summary */}
      {student.status !== "pending" && questions.length > 0 && (() => {
        const sections = getSectionSummary(student, questions);
        if (sections.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-stone-100">
            {sections.map(({ section, answered, total }) => (
              <span
                key={section}
                className={`text-xs font-semibold px-2 py-1 border tabular-nums ${answered === total && total > 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-stone-50 text-stone-600 border-stone-200"
                  }`}
              >
                Section {section}: {answered}/{total}
              </span>
            ))}
          </div>
        );
      })()}

    </div>
  );
}

// ── Main Monitor Component ───────────────────────────────────────────────────
export default function MonitorTab({
  students = [],
  centres = [],
  onRefresh,
  isAdmin,
  viewingMap = {},
  config = null,
  activityFeed = [],
  disconnectedMap = {},
  passMark = 0,
  exams = [],
  questions = [],
  wsConnected = false,
}: {
  students: AdminStudent[];
  centres: Centre[];
  exams?: import("../../../types").Exam[];
  onRefresh: () => void;
  isAdmin: boolean;
  viewingMap?: Record<string, number>;
  config?: ExamConfig | null;
  activityFeed?: ActivityEvent[];
  disconnectedMap?: Record<string, { reason: string; at: string }>;
  passMark?: number;
  questions?: import("../../../types").QuestionRow[];
  wsConnected?: boolean;
}) {
  // ── Filter State ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [centreFilter, setCentreFilter] = useState("all");
  const [streamFilter, setStreamFilter] = useState("all");
  const [paperSetFilter, setPaperSetFilter] = useState("all");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");

  // ── Sort State ───────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({
    col: "name",
    dir: "asc",
  });

  // ── UI State ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<AdminStudent | null>(null);

  // Keep selectedStudent in sync with the live students prop (e.g. after grading)
  useEffect(() => {
    if (!selectedStudent) return;
    const updated = students.find((s) => s.roll_number === selectedStudent.roll_number);
    if (updated) setSelectedStudent(updated);
  }, [students]);
  const [activeAlerts, setActiveAlerts] = useState<StrikeAlert[]>([]);
  const [exporting, setExporting] = useState(false);
  const [showResetAll, setShowResetAll] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [resetAllProgress, setResetAllProgress] = useState<{ done: number; total: number } | null>(null);
  const [streamDefs, setStreamDefs] = useState<import("../../../types").StreamDef[]>([]);
  const [setDefs, setSetDefs] = useState<import("../../../types").StreamDef[]>([]);
  const prevStudentsRef = useRef<AdminStudent[]>([]);
  const rowsPerPage = 30;

  // ── Derived filter options ───────────────────────────────────────────────
  const streams = useMemo(
    () => [...new Set(students.map((s) => s.stream).filter(Boolean))].sort(),
    [students],
  );
  const paperSets = useMemo(
    () => [...new Set(students.map((s) => s.paper_set).filter(Boolean))].sort(),
    [students],
  );

  // ── Real-time strike detection ────────────────────────────────────────────
  useEffect(() => {
    if (prevStudentsRef.current.length > 0) {
      const newAlerts: StrikeAlert[] = [];
      students.forEach((s) => {
        const prev = prevStudentsRef.current.find(
          (p) => p.roll_number === s.roll_number,
        );
        if (prev && (s.strikes || 0) > (prev.strikes || 0)) {
          newAlerts.push({
            id: Math.random().toString(36).substring(7),
            roll_number: s.roll_number,
            name: s.name_en || "Student",
            strikes: s.strikes,
            time: Date.now(),
          });
        }
      });
      if (newAlerts.length > 0)
        setActiveAlerts((curr) => [...newAlerts, ...curr]);
    }
    prevStudentsRef.current = students;
  }, [students]);

  // Auto-dismiss alerts after 15s
  useEffect(() => {
    if (activeAlerts.length === 0) return;
    const interval = setInterval(() => {
      setActiveAlerts((curr) => curr.filter((a) => Date.now() - a.time < 15000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeAlerts]);

  const dismissAlert = useCallback(
    (id: string) => setActiveAlerts((curr) => curr.filter((a) => a.id !== id)),
    [],
  );

  const handleInspect = useCallback(
    (roll_number: string, alertId: string) => {
      const s = students.find((st) => st.roll_number === roll_number);
      if (s) setSelectedStudent(s);
      dismissAlert(alertId);
    },
    [students, dismissAlert],
  );

  // Reset to page 1 on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, centreFilter, streamFilter, paperSetFilter, scoreMin, scoreMax]);

  useEffect(() => {
    api.admin.getStreams().then(setStreamDefs).catch(() => { });
    api.admin.getSets().then(setSetDefs).catch(() => { });
  }, []);

  // ── Filtering & Sorting ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const minScore = scoreMin !== "" ? parseFloat(scoreMin) : null;
    const maxScore = scoreMax !== "" ? parseFloat(scoreMax) : null;

    return students.filter((s) => {
      if (q && !s.roll_number.toLowerCase().includes(q) && !s.name_en.toLowerCase().includes(q))
        return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (centreFilter !== "all" && String(s.centre_id) !== centreFilter) return false;
      if (streamFilter !== "all" && s.stream !== streamFilter) return false;
      if (paperSetFilter !== "all" && s.paper_set !== paperSetFilter) return false;
      if (minScore !== null && (s.score ?? 0) < minScore) return false;
      if (maxScore !== null && (s.score ?? 0) > maxScore) return false;
      return true;
    });
  }, [students, search, statusFilter, centreFilter, streamFilter, paperSetFilter, scoreMin, scoreMax]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      switch (sort.col) {
        case "name": va = a.name_en || ""; vb = b.name_en || ""; break;
        case "roll": va = a.roll_number; vb = b.roll_number; break;
        case "status": va = a.status; vb = b.status; break;
        case "progress": va = a.answered_count || 0; vb = b.answered_count || 0; break;
        case "score": va = a.score ?? -1; vb = b.score ?? -1; break;
        case "strikes": va = a.strikes || 0; vb = b.strikes || 0; break;
        case "centre": va = a.centre_name || ""; vb = b.centre_name || ""; break;
        case "time": va = a.start_time || ""; vb = b.start_time || ""; break;
      }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  const onSort = useCallback((col: string) => {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" },
    );
  }, []);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStudents = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  // ── Stats ────────────────────────────────────────────────────────────────
  const submitted = students.filter(
    (s) => s.status === "submitted" || s.status === "flagged",
  );
  const avgScore = submitted.length
    ? submitted.reduce((sum, s) => sum + (s.score || 0), 0) / submitted.length
    : 0;
  const highestScore = submitted.length
    ? Math.max(...submitted.map((s) => s.score || 0))
    : 0;
  const effectivePassMark = passMark > 0 ? passMark : null;
  const passCount = effectivePassMark != null
    ? submitted.filter((s) => (s.score || 0) >= effectivePassMark).length
    : 0;

  // Rank map for submitted students (1 = highest score)
  const rankMap = useMemo(() => {
    const byScore = [...submitted].sort((a, b) => (b.score || 0) - (a.score || 0));
    const map: Record<string, number> = {};
    byScore.forEach((s, i) => { map[s.roll_number] = i + 1; });
    return map;
  }, [submitted]);

  const SCORE_BANDS = [
    { label: "90–100", min: 90,  max: 1000, color: "bg-teal-500"   },
    { label: "70–89",  min: 70,  max: 90,   color: "bg-gold-500"   },
    { label: "50–69",  min: 50,  max: 70,   color: "bg-amber-400"  },
    { label: "30–49",  min: 30,  max: 50,   color: "bg-orange-500" },
    { label: "0–29",   min: 0,   max: 30,   color: "bg-rose-500"   },
  ];

  const stats = {
    total: students.length,
    active: students.filter((s) => s.status === "active").length,
    submitted: submitted.length,
    flagged: students.filter((s) => s.status === "flagged").length,
    avgScore,
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await api.admin.exportResults();
      exportStudentsCsv(
        data as AdminStudent[],
        `exam_results_${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } finally {
      setExporting(false);
    }
  };

  const handleExportFiltered = () => {
    exportStudentsCsv(sorted, `hall_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleResetAll = async () => {
    setShowResetAll(false);
    setResettingAll(true);

    // We target ALL visible students in the list
    const rolls = sorted.map((s) => s.roll_number);

    try {
      // Use the Atomic SP Bulk Endpoint
      await api.student.bulkReset(rolls);

      // Delay to ensure Neon's Serverless Compute finishes the write before we fetch
      await new Promise((r) => setTimeout(r, 1000));
      await onRefresh();
    } catch (e) {
      console.error("Bulk reset failed", e);
    } finally {
      setResettingAll(false);
    }
  };
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCentreFilter("all");
    setStreamFilter("all");
    setPaperSetFilter("all");
    setScoreMin("");
    setScoreMax("");
  };

  const hasActiveFilters =
    search || statusFilter !== "all" || centreFilter !== "all" ||
    streamFilter !== "all" || paperSetFilter !== "all" ||
    scoreMin !== "" || scoreMax !== "";


  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 w-full">
      {/* Personalized Header Section */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-7 w-1 bg-gold-500 rounded-full" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-700">Al Jamia Al Islamiya</span>
          </div>
          <h2 className="text-3xl font-extrabold text-stone-900 tracking-tight mb-1">
            Examination Hall
          </h2>
          {!isAdmin && centres.length > 0 ? (
            <div className="flex items-center gap-2 mt-1">
              <Building2 className="w-4 h-4 text-brand-600 flex-shrink-0" />
              <span className="text-brand-700 font-bold text-sm">{centres[0].name_en}</span>
              {centres[0].name_ar && (
                <span className="text-stone-400 text-sm font-arabic" dir="rtl">{centres[0].name_ar}</span>
              )}
              <span className="ml-2 px-2 py-0.5 bg-brand-100 text-brand-700 text-[10px] font-bold uppercase tracking-widest rounded">Your Centre</span>
            </div>
          ) : (
            <p className="text-stone-400 font-medium text-sm">
              All candidates for this sitting — click any row to review, grade, or edit.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-600 font-bold text-xs uppercase tracking-widest hover:bg-stone-50 active:bg-stone-100 transition-all shadow-sm rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          {isAdmin && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 text-white font-bold text-xs uppercase tracking-widest hover:bg-brand-800 active:bg-brand-900 transition-all shadow-md shadow-brand-900/10 rounded-lg disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Exporting..." : "Export"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
        <StatCard
          label="Total Students"
          value={stats.total}
          icon={Users}
          accent="from-brand-800 to-brand-700"
          iconBg="bg-brand-50"
          iconColor="text-brand-700"
        />
        <StatCard
          label="Active Now"
          value={stats.active}
          color="text-gold-700"
          icon={Activity}
          accent="from-gold-600 to-gold-400"
          iconBg="bg-gold-50"
          iconColor="text-gold-600"
        />
        <StatCard
          label="Final Submissions"
          value={stats.submitted}
          color="text-emerald-700"
          icon={ClipboardList}
          accent="from-emerald-600 to-emerald-400"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Flagged Issues"
          value={stats.flagged}
          color={stats.flagged > 0 ? "text-rose-600" : "text-stone-400"}
          icon={AlertTriangle}
          accent={stats.flagged > 0 ? "from-rose-600 to-rose-400" : "from-stone-300 to-stone-200"}
          iconBg={stats.flagged > 0 ? "bg-rose-50" : "bg-stone-50"}
          iconColor={stats.flagged > 0 ? "text-rose-600" : "text-stone-400"}
        />
      </div>

      {/* ── Results Analysis (visible once students start submitting) ── */}
      {submitted.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* Score distribution */}
          <div className="bg-white border border-stone-200 shadow-sm p-5 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Score Distribution</p>
              <div className="flex gap-4 text-xs text-stone-500">
                <span>Avg: <span className="font-bold text-stone-900">{avgScore.toFixed(1)}</span></span>
                <span>High: <span className="font-bold text-stone-900">{highestScore}</span></span>
                {effectivePassMark != null && (
                  <span>Pass: <span className="font-bold text-teal-700">{submitted.length ? Math.round((passCount / submitted.length) * 100) : 0}%</span></span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {SCORE_BANDS.map(({ label, min, max, color }) => {
                const count = submitted.filter((s) => (s.score || 0) >= min && (s.score || 0) < max).length;
                const pct = submitted.length ? (count / submitted.length) * 100 : 0;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-medium w-14 text-right tabular-nums">{label}</span>
                    <div className="flex-1 h-5 bg-stone-100 border border-stone-200 relative overflow-hidden rounded-full">
                      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                      {count > 0 && (
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white">{count}</span>
                      )}
                    </div>
                    <span className="text-xs text-stone-400 tabular-nums w-8 text-right">{Math.round(pct)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top performers */}
          <div className="bg-white border border-stone-200 shadow-sm p-5 rounded-lg">
            <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold mb-4">Top Performers</p>
            <div className="space-y-1.5">
              {[...submitted]
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, 5)
                .map((s, i) => (
                  <button
                    key={s.roll_number}
                    onClick={() => setSelectedStudent(s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left rounded-lg"
                  >
                    <span className={`w-7 h-7 flex items-center justify-center flex-shrink-0 font-bold text-xs rounded-lg ${
                      i === 0 ? "bg-amber-400 text-white" :
                      i === 1 ? "bg-stone-300 text-stone-700" :
                      i === 2 ? "bg-amber-700 text-white" : "bg-stone-100 text-stone-500"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-900 text-sm font-bold truncate">{s.name_en}</p>
                      {s.name_ar && <p className="text-stone-600 text-base font-arabic truncate" dir="rtl">{s.name_ar}</p>}
                      <p className="text-stone-400 text-xs font-mono">{s.roll_number}</p>
                    </div>
                    <span className="text-teal-700 font-black tabular-nums text-base flex-shrink-0">
                      {s.score ?? "—"}
                    </span>
                    {effectivePassMark != null && s.score != null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        (s.score || 0) >= effectivePassMark ? "bg-teal-100 text-teal-700" : "bg-rose-100 text-rose-600"
                      }`}>
                        {(s.score || 0) >= effectivePassMark ? "P" : "F"}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Control Panel (Top Row) ── */}
      <div className="mb-8">
        <ExamCountdownBanner config={config} />
      </div>

      <div className="space-y-8 w-full">
        <div className="w-full space-y-8 min-w-0">
          {/* ── Main Monitor Area ── */}
          <div className="bg-white border border-stone-200 shadow-sm rounded-lg overflow-hidden pb-4">
            {/* Table Navigation Header */}
            <div className="px-6 py-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-50/30">
              <div className="flex items-center gap-4">
                <div className="flex p-1 bg-stone-100 rounded-lg shadow-inner border border-stone-200/50">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${viewMode === "list" ? "bg-white text-brand-700 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                  >
                    List View
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${viewMode === "grid" ? "bg-white text-brand-700 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                  >
                    Grid View
                  </button>
                </div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.1em]">
                  {sorted.length} of {students.length} found
                </span>
              </div>

              {isAdmin && (
                <button
                  onClick={() => setShowResetAll(true)}
                  disabled={resettingAll}
                  className="flex items-center gap-2 text-rose-600 hover:text-rose-700 font-bold text-[10px] uppercase tracking-widest transition-all px-3 py-1.5 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${resettingAll ? "animate-spin" : ""}`} />
                  {resettingAll ? "Resetting..." : "Reset Results"}
                </button>
              )}
            </div>

            {/* ── Unified Filter Bar ── */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-stone-100 space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[280px] relative group">
                  <input
                    type="text"
                    placeholder="Search name, roll number, or ID..."
                    className="w-full bg-stone-50 border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all rounded-lg placeholder-stone-400"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-stone-50 border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg font-bold text-stone-600 appearance-none min-w-[140px]"
                  >
                    <option value="all">ANY STATUS</option>
                    <option value="pending">PENDING</option>
                    <option value="active">ACTIVE</option>
                    <option value="submitted">SUBMITTED</option>
                    <option value="flagged">FLAGGED</option>
                  </select>

                  {centres.length > 1 && (
                    <select
                      value={centreFilter}
                      onChange={(e) => setCentreFilter(e.target.value)}
                      className="bg-stone-50 border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg font-bold text-stone-600 appearance-none min-w-[160px]"
                    >
                      <option value="all">ALL CENTRES</option>
                      {centres.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name_en.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  )}

                  <select
                    value={streamFilter}
                    onChange={(e) => setStreamFilter(e.target.value)}
                    className="bg-stone-50 border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg font-bold text-stone-600 appearance-none min-w-[140px]"
                  >
                    <option value="all">ANY STREAM</option>
                    {streamDefs.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name.toUpperCase()}
                      </option>
                    ))}
                  </select>

                  <select
                    value={paperSetFilter}
                    onChange={(e) => setPaperSetFilter(e.target.value)}
                    className="bg-stone-50 border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg font-bold text-stone-600 appearance-none min-w-[120px]"
                  >
                    <option value="all">ANY SET</option>
                    {setDefs.map((s) => (
                      <option key={s.id} value={s.name}>
                        SET {s.name.toUpperCase()}
                      </option>
                    ))}
                  </select>

                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="px-4 py-3 text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest whitespace-nowrap">Score Filter:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={scoreMin}
                      onChange={(e) => setScoreMin(e.target.value)}
                      className="w-20 bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-bold rounded-lg focus:outline-none"
                    />
                    <span className="text-stone-300">—</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={scoreMax}
                      onChange={(e) => setScoreMax(e.target.value)}
                      className="w-20 bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-bold rounded-lg focus:outline-none"
                    />
                  </div>
                </div>

                {streams.length > 1 && (
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest whitespace-nowrap">Stream:</span>
                    <select
                      value={streamFilter}
                      onChange={(e) => setStreamFilter(e.target.value)}
                      className="bg-stone-50 border border-stone-200 px-3 py-2 text-xs font-bold rounded-lg focus:outline-none"
                    >
                      <option value="all">EVERYTHING</option>
                      {streams.map((s) => (
                        <option key={s} value={s}>{s.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* ── Viewport ── */}
            <div className="p-6">
              {viewMode === "grid" && (
                <div>
                  {filtered.length === 0 ? (
                    <div className="py-24 text-center">
                      <Users className="w-12 h-12 text-stone-200 mx-auto mb-4" />
                      <p className="text-stone-400 font-medium">No students found matching those criteria.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-5 mb-6 text-[10px] text-stone-400 font-bold uppercase tracking-widest items-center px-1">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Answered
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm bg-brand-500 shadow-[0_0_8px_rgba(114,19,44,0.3)]" /> In Exam
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm bg-stone-200" /> Pending
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
                        {filtered.map((s) => (
                          <StudentCard
                            key={s.roll_number}
                            student={s}
                            currentQIndex={viewingMap[s.roll_number]}
                            questions={questions}
                            onClick={() => setSelectedStudent(s)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {viewMode === "list" && (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-left">
                    <thead className="bg-stone-50/50 border-y border-stone-100">
                      <tr>
                        <SortHeader label="Student Details" col="name" sort={sort} onSort={onSort} className="px-6" />
                        <SortHeader label="Centre" col="centre" sort={sort} onSort={onSort} className="hidden sm:table-cell" />
                        <SortHeader label="Status" col="status" sort={sort} onSort={onSort} />
                        <SortHeader label="Performance" col="progress" sort={sort} onSort={onSort} />
                        <SortHeader label="Score" col="score" sort={sort} onSort={onSort} />
                        <SortHeader label="Strikes" col="strikes" sort={sort} onSort={onSort} className="hidden md:table-cell" />
                        <th className="px-6 py-3 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {pageStudents.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-20 text-center">
                            <Users className="w-12 h-12 text-stone-200 mx-auto mb-4" />
                            <p className="text-stone-400 font-medium font-sans">No search results.</p>
                          </td>
                        </tr>
                      ) : (
                        pageStudents.map((s) => {
                          const progress = s.total_questions ? (s.answered_count / s.total_questions) * 100 : 0;
                          const isSelected = selectedStudent?.roll_number === s.roll_number;
                          const sections = questions.length > 0 ? getSectionSummary(s, questions) : [];
                          return (
                            <tr
                              key={s.roll_number}
                              onClick={() => setSelectedStudent(s)}
                              className={`group cursor-pointer transition-all duration-200
                                ${isSelected ? "bg-brand-50/50 border-l-4 border-brand-600" : "border-l-4 border-transparent hover:bg-stone-50"}`}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400 font-bold text-xs group-hover:bg-brand-100 group-hover:text-brand-700 transition-colors">
                                    {s.name_en?.charAt(0) || "S"}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-stone-900 text-sm font-bold flex items-center gap-2">
                                      {s.name_en || "Anonymous"}
                                      {disconnectedMap[s.roll_number] && s.status === "active" && (
                                        <WifiOff className="w-3.5 h-3.5 text-orange-500" />
                                      )}
                                    </p>
                                    <p className="font-mono text-[10px] text-stone-400 font-bold uppercase tracking-wider">{s.roll_number}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-xs font-bold text-stone-500 uppercase tracking-widest hidden sm:table-cell">{s.centre_name || "—"}</td>
                              <td className="px-4 py-4">
                                <span className={`inline-flex items-center gap-2 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest border-2 rounded-lg ${STATUS_STYLES[s.status] || ""}`}>
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                {sections.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {sections.map(({ section, answered, total }) => (
                                      <span
                                        key={section}
                                        className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 border tabular-nums ${
                                          answered === 0
                                            ? "bg-stone-50 text-stone-400 border-stone-200"
                                            : answered === total
                                              ? "bg-stone-100 text-stone-700 border-stone-300"
                                              : "bg-amber-50 text-amber-700 border-amber-200"
                                        }`}
                                      >
                                        <span className="font-normal text-[9px] uppercase tracking-widest">Section {section}</span>
                                        <span className="font-black">{answered}/{total}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-brand-600 rounded-full" style={{ width: `${progress}%` }} />
                                    </div>
                                    <span className="text-stone-700 text-xs font-bold tabular-nums">{s.answered_count}/{s.total_questions}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                {(s.status === "submitted" || s.status === "flagged") ? (
                                  <div className="flex items-center gap-1.5">
                                    {rankMap[s.roll_number] != null && rankMap[s.roll_number] <= 3 && (
                                      <span className={`w-5 h-5 flex items-center justify-center text-[9px] font-black rounded ${
                                        rankMap[s.roll_number] === 1 ? "bg-amber-400 text-white" :
                                        rankMap[s.roll_number] === 2 ? "bg-stone-300 text-stone-700" :
                                        "bg-amber-700 text-white"
                                      }`}>{rankMap[s.roll_number]}</span>
                                    )}
                                    <span className={`font-black tabular-nums text-sm ${
                                      effectivePassMark == null ? "text-stone-900" :
                                      (s.score || 0) >= effectivePassMark ? "text-teal-700" : "text-rose-600"
                                    }`}>{s.score ?? "—"}</span>
                                    {effectivePassMark != null && s.score != null && (
                                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                        (s.score || 0) >= effectivePassMark ? "bg-teal-100 text-teal-700" : "bg-rose-100 text-rose-600"
                                      }`}>
                                        {(s.score || 0) >= effectivePassMark ? "PASS" : "FAIL"}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-stone-300 font-bold">—</span>
                                )}
                              </td>
                              <td className="px-4 py-4 hidden md:table-cell">
                                <div className="flex gap-1.5">
                                  {[1, 2, 3].map((n) => (
                                    <div key={n} className={`w-3 h-3 rounded-md border-2 ${n <= (s.strikes || 0) ? "bg-rose-500 border-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.3)]" : "bg-stone-100 border-stone-200"}`} />
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-300 group-hover:bg-brand-600 group-hover:text-white transition-all">
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination Footer */}
            {sorted.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-stone-100 bg-stone-50/50 gap-4">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                  Showing {(safePage - 1) * rowsPerPage + 1} – {Math.min(safePage * rowsPerPage, sorted.length)} of <span className="text-stone-900">{sorted.length}</span> students
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-sm disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <div className="h-8 flex items-center px-4 bg-white border border-stone-200 rounded-lg text-xs font-black text-stone-900 tabular-nums shadow-inner">
                    {safePage} / {totalPages}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-sm disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Activity Feed ── */}
        <div className="mt-8">
          <ActivityFeed
            feed={activityFeed}
            onInspect={(roll) => {
              const s = students.find((st) => st.roll_number === roll);
              if (s) setSelectedStudent(s);
            }}
          />
        </div>

        {/* ── Modals & Overlays ── */}
        {showResetAll && (
          <ResetAllModal
            count={sorted.length}
            onConfirm={handleResetAll}
            onCancel={() => setShowResetAll(false)}
          />
        )}

        {selectedStudent && (
          <StudentDetailModal
            key={selectedStudent.roll_number}
            student={selectedStudent}
            onClose={() => setSelectedStudent(null)}
            onRefresh={onRefresh}
            isAdmin={isAdmin}
            passMark={passMark}
            exams={exams}
            centres={centres}
            streams={streamDefs}
            sets={setDefs}
            questions={questions}
          />
        )}

        {resettingAll && resetAllProgress && (
          <div className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white border-2 border-brand-100 shadow-2xl p-8 max-w-sm w-full text-center rounded-lg">
              <Loader2 className="w-12 h-12 animate-spin text-brand-700 mx-auto mb-6" />
              <h3 className="text-xl font-black text-stone-900 mb-2 uppercase tracking-tight">Syncing Progress</h3>
              <p className="text-stone-500 text-sm mb-6 leading-relaxed">
                Resetting exam states for {resetAllProgress.done} / {resetAllProgress.total} students.
              </p>
              <div className="h-3 bg-stone-100 rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-brand-700 transition-all duration-300 rounded-full"
                  style={{ width: `${(resetAllProgress.done / Math.max(resetAllProgress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
