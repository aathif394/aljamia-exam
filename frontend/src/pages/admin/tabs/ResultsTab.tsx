import { useState, useMemo, useEffect } from "react";
import type { AdminStudent, Centre } from "../../../types";
import { api } from "../../../api/client";
import { Download, Loader2, Search, X, ChevronUp, ChevronDown, Trophy } from "lucide-react";
import { StudentDetailModal, exportStudentsCsv, STATUS_STYLES, STATUS_DOT, formatDateTime, getSectionSummary } from "./StudentDetail";

// ── Score band helper ─────────────────────────────────────────────────────────
const SCORE_BANDS = [
  { label: "90–100", min: 90,  max: 1000, color: "bg-teal-500"  },
  { label: "70–89",  min: 70,  max: 90,   color: "bg-gold-500"  },
  { label: "50–69",  min: 50,  max: 70,   color: "bg-amber-400" },
  { label: "30–49",  min: 30,  max: 50,   color: "bg-orange-500"},
  { label: "0–29",   min: 0,   max: 30,   color: "bg-rose-500"  },
];

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  colorClass = "text-stone-900",
}: {
  label: string;
  value: string | number;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-white border border-stone-200 p-4 sm:p-5 shadow-sm rounded-lg">
      <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold mb-1.5">
        {label}
      </p>
      <p className={`text-3xl font-bold tabular-nums ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────
function SortTh({
  label,
  col,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  col: string;
  sort: { col: string; dir: "asc" | "desc" };
  onSort: (c: string) => void;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 sm:px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider cursor-pointer select-none hover:text-stone-900 transition-colors text-left ${className}`}
    >
      <span className="flex items-center gap-0.5">
        {label}
        <span className="flex flex-col -space-y-0.5 ml-0.5">
          <ChevronUp   className={`w-2.5 h-2.5 ${active && sort.dir === "asc"  ? "text-brand-600" : "text-stone-300"}`} />
          <ChevronDown className={`w-2.5 h-2.5 ${active && sort.dir === "desc" ? "text-brand-600" : "text-stone-300"}`} />
        </span>
      </span>
    </th>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ResultsTab({
  students,
  isAdmin,
  onRefresh,
  passMark = 0,
  exams = [],
  questions = [],
  centres = [],
}: {
  students: AdminStudent[];
  isAdmin?: boolean;
  onRefresh?: () => void;
  passMark?: number;
  exams?: import("../../../types").Exam[];
  questions?: import("../../../types").QuestionRow[];
  centres?: Centre[];
}) {
  const [exporting, setExporting]         = useState(false);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<"all" | "submitted" | "flagged" | "active" | "pending">("all");
  const [sort, setSort]                   = useState<{ col: string; dir: "asc" | "desc" }>({ col: "score", dir: "desc" });
  const [paperSetFilter, setPaperSetFilter] = useState("all");
  const [streamFilter, setStreamFilter]     = useState("all");
  const [selected, setSelected]           = useState<AdminStudent | null>(null);
  const [streamDefs, setStreamDefs]       = useState<import("../../../types").StreamDef[]>([]);
  const [setDefs, setSetDefs]             = useState<import("../../../types").StreamDef[]>([]);

  useEffect(() => {
    api.admin.getStreams().then(setStreamDefs).catch(() => {});
    api.admin.getSets().then(setSetDefs).catch(() => {});
  }, []);

  // ── Derived stats ────────────────────────────────────────────────────────
  const submittedOrFlagged = useMemo(
    () => students.filter((s) => s.status === "submitted" || s.status === "flagged"),
    [students],
  );
  const submittedOnly = useMemo(
    () => students.filter((s) => s.status === "submitted"),
    [students],
  );
  const avgScore = submittedOrFlagged.length
    ? submittedOrFlagged.reduce((sum, s) => sum + (s.score || 0), 0) / submittedOrFlagged.length
    : 0;
  const highest = submittedOrFlagged.length
    ? Math.max(...submittedOrFlagged.map((s) => s.score || 0))
    : 0;
  // effectivePassMark is null when not configured — no pass/fail coloring
  const effectivePassMark = passMark > 0 ? passMark : null;
  const passRateThreshold = effectivePassMark ?? 50; // for the stat card, default display to 50
  const passCount = submittedOrFlagged.filter((s) => (s.score || 0) >= passRateThreshold).length;

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return students.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !s.roll_number.toLowerCase().includes(q) && !s.name_en.toLowerCase().includes(q)) return false;
      if (paperSetFilter !== "all" && s.paper_set !== paperSetFilter) return false;
      if (streamFilter !== "all" && s.stream !== streamFilter) return false;
      return true;
    });
  }, [students, search, statusFilter, paperSetFilter, streamFilter]);

  // ── Sort ─────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      switch (sort.col) {
        case "rank":     va = a.score ?? -1;           vb = b.score ?? -1;           break;
        case "score":    va = a.score ?? -1;           vb = b.score ?? -1;           break;
        case "name":     va = a.name_en || "";         vb = b.name_en || "";         break;
        case "roll":     va = a.roll_number;           vb = b.roll_number;           break;
        case "stream":   va = a.stream || "";          vb = b.stream || "";          break;
        case "centre":   va = a.centre_name || "";     vb = b.centre_name || "";     break;
        case "progress": va = a.answered_count || 0;  vb = b.answered_count || 0;   break;
        case "strikes":  va = a.strikes || 0;         vb = b.strikes || 0;          break;
        case "time":     va = a.submit_time || "";     vb = b.submit_time || "";     break;
      }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ?  1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  // Rank map: score rank among submitted/flagged (1 = highest)
  const rankMap = useMemo(() => {
    const byScore = [...submittedOrFlagged].sort((a, b) => (b.score || 0) - (a.score || 0));
    const map: Record<string, number> = {};
    byScore.forEach((s, i) => { map[s.roll_number] = i + 1; });
    return map;
  }, [submittedOrFlagged]);

  const onSort = (col: string) =>
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { col, dir: col === "score" ? "desc" : "asc" });

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await api.admin.exportResults();
      exportStudentsCsv(data as AdminStudent[], `results_${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportFiltered = () =>
    exportStudentsCsv(sorted, `results_filtered_${new Date().toISOString().slice(0, 10)}.csv`);

  return (
    <div className="w-full space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Results
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            {submittedOrFlagged.length} of {students.length} students have
            submitted
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExportFiltered}
            className="flex items-center gap-2 bg-white text-stone-700 font-bold uppercase tracking-widest px-5 h-10 border-2 border-stone-200 hover:bg-stone-50 transition-all text-[10px] shadow-md shadow-stone-900/5 rounded-lg"
          >
            <Download className="w-4 h-4" />
            Export View
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 bg-brand-700 text-white font-bold uppercase tracking-widest px-5 h-10 hover:bg-brand-800 transition-all text-[10px] shadow-md shadow-brand-900/10 rounded-lg disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? "Exporting…" : "Full Export"}
          </button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Submitted"
          value={submittedOrFlagged.length}
          sub={`${submittedOnly.length} clean · ${students.filter((s) => s.status === "flagged").length} flagged`}
          colorClass="text-brand-600"
        />
        <StatCard
          label="Avg Score"
          value={submittedOrFlagged.length ? avgScore.toFixed(1) : "—"}
          sub={`Highest: ${submittedOrFlagged.length ? highest : "—"}`}
          colorClass="text-teal-700"
        />
        <StatCard
          label={`Pass Rate (≥${effectivePassMark ?? 50})`}
          value={
            submittedOrFlagged.length
              ? `${Math.round((passCount / submittedOrFlagged.length) * 100)}%`
              : "—"
          }
          sub={`${passCount} of ${submittedOrFlagged.length}`}
          colorClass="text-stone-900"
        />
        <StatCard
          label="Pending"
          value={students.filter((s) => s.status === "pending").length}
          sub={`${students.filter((s) => s.status === "active").length} active now`}
          colorClass="text-amber-600"
        />
      </div>

      {/* ── Score distribution + breakdown ── */}
      {submittedOrFlagged.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar chart */}
          <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
            <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold mb-4">
              Score Distribution
            </p>
            <div className="space-y-2.5">
              {SCORE_BANDS.map(({ label, min, max, color }) => {
                const count = submittedOrFlagged.filter(
                  (s) => (s.score || 0) >= min && (s.score || 0) < max,
                ).length;
                const pct = (count / submittedOrFlagged.length) * 100;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-medium w-14 text-right tabular-nums">
                      {label}
                    </span>
                    <div className="flex-1 h-5 bg-stone-100 border border-stone-200 relative overflow-hidden rounded-full">
                      <div
                        className={`h-full ${color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                      {count > 0 && (
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white mix-blend-normal">
                          {count > 0 ? count : ""}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-stone-500 tabular-nums w-8 text-right">
                      {Math.round(pct)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 5 leaderboard */}
          <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
            <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold mb-4">
              Top Performers
            </p>
            <div className="space-y-2">
              {[...submittedOrFlagged]
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, 5)
                .map((s, i) => (
                  <button
                    key={s.roll_number}
                    onClick={() => setSelected(s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left"
                  >
                    <span
                      className={`w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold text-xs rounded-lg ${
                        i === 0
                          ? "bg-amber-400 text-white"
                          : i === 1
                            ? "bg-stone-300 text-stone-900"
                            : i === 2
                              ? "bg-amber-700 text-white"
                              : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {i === 0 ? <Trophy className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-900 text-sm font-bold truncate">
                        {s.name_en}
                      </p>
                      {s.name_ar && <p className="text-stone-600 text-base font-arabic truncate" dir="rtl">{s.name_ar}</p>}
                      <p className="text-stone-400 text-xs font-mono">
                        {s.roll_number}
                      </p>
                    </div>
                    <span className="text-teal-700 font-bold tabular-nums text-lg flex-shrink-0">
                      {s.score ?? "—"}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="bg-white border border-stone-200 shadow-sm p-3 sm:p-4 flex flex-col sm:flex-row gap-3 rounded-lg">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name or roll number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-stone-300 text-sm text-stone-900 bg-white placeholder-stone-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap flex-1">
          {(["all", "submitted", "flagged", "active", "pending"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest border-2 transition-all rounded-lg ${
                  statusFilter === s
                    ? "bg-brand-700 text-white border-brand-700 shadow-md shadow-brand-900/10 scale-[1.02]"
                    : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:border-brand-300"
                }`}
              >
                {s === "all"
                  ? `All (${students.length})`
                  : `${s.charAt(0).toUpperCase() + s.slice(1)} (${students.filter((x) => x.status === s).length})`}
              </button>
            ),
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <select
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            className="bg-white border-2 border-stone-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg text-stone-600"
          >
            <option value="all">Any Stream</option>
            {streamDefs.map((s) => (
              <option key={s.id} value={s.name}>{s.name.toUpperCase()}</option>
            ))}
          </select>

          <select
            value={paperSetFilter}
            onChange={(e) => setPaperSetFilter(e.target.value)}
            className="bg-white border-2 border-stone-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg text-stone-600"
          >
            <option value="all">Any Set</option>
            {setDefs.map((s) => (
              <option key={s.id} value={s.name}>SET {s.name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Results table ── */}
      <div className="bg-white border border-stone-200 shadow-sm overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-3 sm:px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider w-10">
                  #
                </th>
                <SortTh
                  label="Student"
                  col="name"
                  sort={sort}
                  onSort={onSort}
                />
                <SortTh
                  label="Status"
                  col="status"
                  sort={sort}
                  onSort={onSort}
                />
                <SortTh label="Score" col="score" sort={sort} onSort={onSort} />
                <SortTh
                  label="Progress"
                  col="progress"
                  sort={sort}
                  onSort={onSort}
                  className="hidden sm:table-cell"
                />
                <SortTh
                  label="Strikes"
                  col="strikes"
                  sort={sort}
                  onSort={onSort}
                  className="hidden md:table-cell"
                />
                <SortTh
                  label="Stream"
                  col="stream"
                  sort={sort}
                  onSort={onSort}
                  className="hidden lg:table-cell"
                />
                <SortTh
                  label="Centre"
                  col="centre"
                  sort={sort}
                  onSort={onSort}
                  className="hidden lg:table-cell"
                />
                <SortTh
                  label="Submitted"
                  col="time"
                  sort={sort}
                  onSort={onSort}
                  className="hidden xl:table-cell"
                />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-16 text-center text-stone-400 text-sm"
                  >
                    No students match the current filters.
                  </td>
                </tr>
              ) : (
                sorted.map((s) => {
                  const rank = rankMap[s.roll_number];
                  const progressPct = s.total_questions
                    ? Math.round((s.answered_count / s.total_questions) * 100)
                    : 0;

                  return (
                    <tr
                      key={s.roll_number}
                      onClick={() => setSelected(s)}
                      className={`border-b border-stone-100 cursor-pointer transition-colors hover:bg-brand-50/40 ${
                        s.status === "flagged" ? "bg-rose-50/20" : ""
                      }`}
                    >
                      {/* Rank */}
                      <td className="px-3 sm:px-4 py-3 w-10">
                        {rank != null ? (
                          <span
                            className={`inline-flex w-7 h-7 items-center justify-center text-xs font-bold rounded-lg ${
                              rank === 1
                                ? "bg-amber-400 text-white"
                                : rank === 2
                                  ? "bg-stone-300 text-stone-900"
                                  : rank === 3
                                    ? "bg-amber-700/80 text-white"
                                    : "text-stone-400"
                            }`}
                          >
                            {rank <= 3 ? <Trophy className="w-3 h-3" /> : rank}
                          </span>
                        ) : (
                          <span className="text-stone-200 text-xs">—</span>
                        )}
                      </td>

                      {/* Student */}
                      <td className="px-3 sm:px-4 py-3">
                        <p className="text-stone-900 text-sm font-bold leading-tight">
                          {s.name_en || "—"}
                        </p>
                        {s.name_ar && (
                          <p className="text-stone-600 font-arabic text-base mt-0.5" dir="rtl">
                            {s.name_ar}
                          </p>
                        )}
                        <p className="font-mono text-xs text-stone-400 mt-0.5">
                          {s.roll_number}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-3 sm:px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border rounded-lg ${STATUS_STYLES[s.status] || ""}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status] || "bg-stone-400"}`}
                          />
                          {s.status}
                        </span>
                      </td>

                      {/* Score */}
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-base font-bold tabular-nums ${
                              s.score == null
                                ? "text-stone-300"
                                : effectivePassMark == null
                                  ? "text-stone-900"
                                  : (s.score || 0) >= effectivePassMark
                                    ? "text-teal-700"
                                    : "text-rose-600"
                            }`}
                          >
                            {s.score ?? "—"}
                          </span>
                          {effectivePassMark != null && s.score != null && (
                            <span
                              className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                                (s.score || 0) >= effectivePassMark
                                  ? "bg-teal-100 text-teal-700"
                                  : "bg-rose-100 text-rose-600"
                              }`}
                            >
                              {(s.score || 0) >= effectivePassMark ? "PASS" : "FAIL"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Progress */}
                      <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-stone-100 border border-stone-200 overflow-hidden flex-shrink-0 rounded-full">
                            <div
                              className="h-full bg-brand-500 rounded-full"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-stone-500 tabular-nums">
                            {s.answered_count}/{s.total_questions ?? "?"}
                          </span>
                        </div>
                        {questions.length > 0 && (() => {
                          const sections = getSectionSummary(s, questions);
                          if (sections.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {sections.map(({ section, answered, total }) => (
                                <span
                                  key={section}
                                  className={`text-[10px] font-bold px-2.5 py-1 border tabular-nums rounded-lg uppercase tracking-widest ${
                                    answered === total && total > 0
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
                      </td>

                      {/* Strikes */}
                      <td className="px-3 sm:px-4 py-3 hidden md:table-cell">
                        {(s.strikes ?? 0) > 0 ? (
                          <span className="text-rose-600 font-bold text-sm tabular-nums">
                            {"⚡".repeat(Math.min(s.strikes, 3))} {s.strikes}
                          </span>
                        ) : (
                          <span className="text-stone-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Stream */}
                      <td className="px-3 sm:px-4 py-3 hidden lg:table-cell text-sm text-stone-600">
                        {s.stream || "—"}
                      </td>

                      {/* Centre */}
                      <td className="px-3 sm:px-4 py-3 hidden lg:table-cell text-sm text-stone-600">
                        {s.centre_name || "—"}
                      </td>

                      {/* Time */}
                      <td className="px-3 sm:px-4 py-3 hidden xl:table-cell text-xs text-stone-500 font-mono">
                        {formatDateTime(s.submit_time)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
            <p className="text-xs text-stone-500">
              Showing{" "}
              <span className="font-semibold text-stone-900">
                {sorted.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-stone-900">
                {students.length}
              </span>{" "}
              students
            </p>
            <p className="text-xs text-stone-400">
              Click any row to view details
            </p>
          </div>
        )}
      </div>

      {/* ── Student detail modal ── */}
      {selected && (
        <StudentDetailModal
          key={selected.roll_number}
          student={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            setSelected(null);
            onRefresh?.();
          }}
          isAdmin={!!isAdmin}
          passMark={passMark}
          exams={exams}
          centres={centres}
          streams={streamDefs}
          sets={setDefs}
        />
      )}
    </div>
  );
}
