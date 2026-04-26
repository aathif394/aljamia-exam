import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "../../../api/client";
import type { AdminStudent, QuestionRow, Centre } from "../../../types";
import {
  X,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  Minus,
  RefreshCw,
  User,
  ChevronLeft,
  ChevronRight,
  Save,
  AlertCircle,
  Edit,
} from "lucide-react";

// ── Shared constants ─────────────────────────────────────────────────���────────
export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-brand-50 text-brand-700 border-brand-200",
  submitted: "bg-stone-100 text-stone-600 border-stone-300",
  flagged: "bg-rose-50 text-rose-700 border-rose-200",
};

export const STATUS_DOT: Record<string, string> = {
  pending: "bg-amber-400",
  active: "bg-brand-500",
  submitted: "bg-stone-400",
  flagged: "bg-rose-500",
};

// ── Helpers ───────────────────────────��─────────────────────────────────���─────
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Returns per-section answered/total counts for a student, filtered by their paper set. */
export function getSectionSummary(
  student: AdminStudent,
  questions: QuestionRow[],
): { section: number; answered: number; total: number }[] {
  const relevant = questions.filter(
    (q) => 
      q.paper_set.toUpperCase() === (student.paper_set ?? "").toUpperCase() &&
      (!q.stream || q.stream === student.stream)
  );
  const sectionMap = new Map<number, { answered: number; total: number }>();
  for (const q of relevant) {
    if (!sectionMap.has(q.section)) sectionMap.set(q.section, { answered: 0, total: 0 });
    const entry = sectionMap.get(q.section)!;
    entry.total += 1;
    if (student.answers?.[String(q.id)]) entry.answered += 1;
  }
  return Array.from(sectionMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([section, counts]) => ({ section, ...counts }));
}

export function exportStudentsCsv(rows: AdminStudent[], filename: string) {
  const headers = [
    "Roll Number", "Name (EN)", "Stream", "Course", "Centre",
    "Paper Set", "Status", "Score", "Answered", "Total Qs",
    "Strikes", "Start Time", "Submit Time",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) => [
      r.roll_number,
      `"${(r.name_en || "").replace(/"/g, '""')}"`,
      r.stream || "",
      `"${(r.course || "").replace(/"/g, '""')}"`,
      `"${(r.centre_name || "").replace(/"/g, '""')}"`,
      r.paper_set || "",
      r.status || "",
      r.score ?? 0,
      r.answered_count ?? 0,
      r.total_questions ?? 0,
      r.strikes ?? 0,
      r.start_time ? new Date(r.start_time).toLocaleString() : "",
      r.submit_time ? new Date(r.submit_time).toLocaleString() : "",
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold mb-0.5">
        {label}
      </p>
      <p className="text-stone-900 text-base font-medium break-words">{value}</p>
    </div>
  );
}

// ── Question status helpers ──────────────────────────────���────────────────────
type QStatus = "correct" | "wrong" | "manual" | "blank";

function getQStatus(q: QuestionRow, answer: string, manualMark: string): QStatus {
  const isAuto = q.type === "mcq" || q.type === "true_false";
  if (!answer.trim()) return "blank";
  if (isAuto) return answer === q.correct_answer ? "correct" : "wrong";
  return parseFloat(manualMark) > 0 ? "manual" : "manual"; // needs manual
}

const STATUS_DOT_Q: Record<QStatus, string> = {
  correct: "bg-teal-500",
  wrong: "bg-rose-500",
  manual: "bg-amber-400",
  blank: "bg-stone-300",
};

const STATUS_ICON_Q: Record<QStatus, React.ReactNode> = {
  correct: <CheckCircle className="w-4 h-4 text-teal-600" />,
  wrong: <XCircle className="w-4 h-4 text-rose-500" />,
  manual: <AlertCircle className="w-4 h-4 text-amber-500" />,
  blank: <Minus className="w-4 h-4 text-stone-400" />,
};

// ── Grading panel for a single question ─────────────────���────────────────────
function QuestionGrader({
  question,
  student,
  studentAnswer,
  manualMark,
  onMarkChange,
  isAdmin,
  flatIndex,
  total,
  onPrev,
  onNext,
}: {
  question: QuestionRow;
  student: AdminStudent;
  studentAnswer: string;
  manualMark: string;
  onMarkChange: (v: string) => void;
  isAdmin: boolean;
  flatIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const isAuto = question.type === "mcq" || question.type === "true_false";
  const isBlank = !studentAnswer.trim();
  const isCorrect = isAuto && !isBlank && studentAnswer === question.correct_answer;
  const isWrong = isAuto && !isBlank && studentAnswer !== question.correct_answer;

  const parseOptions = (opts: unknown): string[] => {
    if (Array.isArray(opts)) return opts as string[];
    if (typeof opts === "string") { try { return JSON.parse(opts); } catch { return []; } }
    return [];
  };
  const optionsEn = parseOptions(question.options_en);
  const optionsAr = parseOptions(question.options_ar);
  const optionLabels = ["A", "B", "C", "D", "E", "F"];

  // Quick mark buttons for manual questions
  const maxMarks = question.marks;
  const quickMarks: number[] = [];
  for (let i = 0; i <= maxMarks; i += maxMarks > 4 ? 1 : 0.5) {
    quickMarks.push(Math.round(i * 2) / 2);
    if (quickMarks.length > 12) break;
  }

  const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    mcq: { label: "Multiple Choice", color: "bg-brand-100 text-brand-700" },
    true_false: { label: "True / False", color: "bg-violet-100 text-violet-700" },
    fill_blank: { label: "Fill in Blank", color: "bg-gold-100 text-gold-700" },
    descriptive: { label: "Descriptive", color: "bg-orange-100 text-orange-700" },
  };
  const typeInfo = TYPE_LABELS[question.type] ?? { label: question.type, color: "bg-stone-100 text-stone-600" };

  return (
    <div className="flex flex-col h-full">
      {/* Question header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-stone-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-stone-400 text-sm font-mono">
            Q{question.question_number}
            <span className="text-stone-300 mx-1">/</span>
            <span className="text-stone-400">{total}</span>
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
          <span className="text-xs text-stone-400 font-medium">
            {question.marks} mark{question.marks !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Auto-grade result badge */}
        {isAuto && (
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${isBlank ? "text-stone-400" : isCorrect ? "text-teal-700" : "text-rose-600"
            }`}>
            {isBlank
              ? <><Minus className="w-4 h-4" /> Not answered</>
              : isCorrect
                ? <><CheckCircle className="w-4 h-4" /> Correct · +{question.marks}</>
                : <><XCircle className="w-4 h-4" /> Wrong · +0</>
            }
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* Question text */}
        <div className="px-5 pt-5 pb-4 space-y-4">
          {question.question_en && (
            <p className="text-stone-900 text-lg sm:text-xl leading-relaxed font-medium">
              {question.question_en}
            </p>
          )}
          {question.question_ar && (
            <p className="text-stone-900 text-2xl sm:text-3xl leading-relaxed font-arabic" dir="rtl">
              {question.question_ar}
            </p>
          )}
        </div>

        {/* ── MCQ answer view ── */}
        {question.type === "mcq" && (
          <div className="px-5 pb-5 space-y-2">
            {optionsEn.map((opt, i) => {
              const label = optionLabels[i] ?? String(i);
              const isChosen = studentAnswer === label;
              const isCorrectOpt = question.correct_answer === label;
              const optAr = optionsAr[i];

              let style = "bg-white border-stone-200 text-stone-700";
              if (isCorrectOpt && isChosen) style = "bg-teal-50 border-teal-500 text-teal-900";
              else if (isCorrectOpt) style = "bg-teal-50 border-teal-300 text-teal-800";
              else if (isChosen) style = "bg-rose-50 border-rose-400 text-rose-900";

              return (
                <div
                  key={i}
                  className={`flex flex-col gap-2 px-4 py-3 border-2 rounded-xl transition-all ${style} ${isChosen && !isCorrectOpt ? "shadow-sm shadow-rose-100" : ""} ${isCorrectOpt ? "shadow-sm shadow-teal-100" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${isCorrectOpt && isChosen ? "bg-teal-600 text-white" :
                      isCorrectOpt ? "bg-teal-500 text-white" :
                        isChosen ? "bg-rose-500 text-white" :
                          "bg-stone-100 text-stone-500"
                      }`}>
                      {label}
                    </span>
                    <div className="flex-1 space-y-1">
                      <span className="text-base sm:text-lg leading-snug block font-medium">{opt}</span>
                      {optAr && (
                        <span className="text-xl sm:text-2xl leading-relaxed block font-arabic" dir="rtl">{optAr}</span>
                      )}
                    </div>
                    <div className="flex-shrink-0 ml-2 flex flex-col items-end gap-1">
                      {isCorrectOpt && isChosen && (
                        <div className="flex items-center gap-1.5 text-teal-700 bg-teal-100/50 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle className="w-3 h-3" /> Correct
                        </div>
                      )}
                      {isCorrectOpt && !isChosen && (
                        <div className="flex items-center gap-1.5 text-teal-600 bg-teal-100/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle className="w-3 h-3" /> Correct Answer
                        </div>
                      )}
                      {!isCorrectOpt && isChosen && (
                        <div className="flex items-center gap-1.5 text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          <XCircle className="w-3 h-3" /> Student Choice
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {isBlank && (
              <p className="text-stone-400 text-sm italic px-1">Student did not select an answer.</p>
            )}
          </div>
        )}

        {/* ── True/False answer view ── */}
        {question.type === "true_false" && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              {["true", "false"].map((val) => {
                const isChosen = studentAnswer === val;
                const isCorrectOpt = question.correct_answer === val;
                const labelAr = val === "true" ? "صحيح" : "خطأ";
                let style = "bg-white border-stone-200 text-stone-600";
                if (isCorrectOpt && isChosen) style = "bg-teal-50 border-teal-500 text-teal-900";
                else if (isCorrectOpt) style = "bg-teal-50 border-teal-300 text-teal-800";
                else if (isChosen) style = "bg-rose-50 border-rose-400 text-rose-900";

                return (
                  <div key={val} className={`px-4 py-4 border-2 rounded-xl text-center relative transition-all ${style} ${isChosen && !isCorrectOpt ? "shadow-sm shadow-rose-100" : ""} ${isCorrectOpt ? "shadow-sm shadow-teal-100" : ""}`}>
                    <p className="text-lg font-bold capitalize mb-1">{val}</p>
                    <p className="text-xl font-arabic" dir="rtl">{labelAr}</p>
                    
                    <div className="mt-3 flex flex-col items-center gap-1">
                      {isCorrectOpt && isChosen && (
                        <div className="flex items-center gap-1.5 text-teal-700 bg-teal-100/50 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle className="w-3 h-3" /> Correct
                        </div>
                      )}
                      {isCorrectOpt && !isChosen && (
                        <div className="flex items-center gap-1.5 text-teal-600 bg-teal-100/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle className="w-3 h-3" /> Correct Answer
                        </div>
                      )}
                      {!isCorrectOpt && isChosen && (
                        <div className="flex items-center gap-1.5 text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          <XCircle className="w-3 h-3" /> Student Choice
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {isBlank && <p className="text-stone-400 text-sm italic mt-3">Student did not answer.</p>}
          </div>
        )}

        {/* ── Fill in blank / Descriptive answer view ── */}
        {(question.type === "fill_blank" || question.type === "descriptive") && (
          <div className="px-5 pb-5 space-y-4">
            {/* Student's answer */}
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
                Student's Answer
              </p>
              {isBlank ? (
                <div className="bg-stone-50 border border-stone-200 px-4 py-4 text-stone-400 text-sm italic">
                  No answer provided.
                </div>
              ) : (
                <div className={`border px-4 py-4 text-stone-900 leading-relaxed whitespace-pre-wrap ${question.type === "descriptive" ? "min-h-[120px]" : ""
                  } bg-white border-stone-300 ${student.name_ar || studentAnswer.match(/[\u0600-\u06FF]/) ? "font-arabic text-2xl" : "text-lg"}`} dir={studentAnswer.match(/[\u0600-\u06FF]/) ? "rtl" : "ltr"}>
                  {studentAnswer}
                </div>
              )}
              {!isBlank && (
                <p className="text-xs text-stone-400 mt-1 text-right">
                  {studentAnswer.length} characters
                  {question.type === "descriptive" && ` · ${studentAnswer.trim().split(/\s+/).filter(Boolean).length} words`}
                </p>
              )}
            </div>

            {/* Mark input (admin only) */}
            {isAdmin && (
              <div className="bg-stone-50 border border-stone-200 px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-stone-700">
                    Award marks
                  </p>
                  <span className="text-xs text-stone-400">out of {question.marks}</span>
                </div>

                {/* Quick mark buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {quickMarks.map((m) => (
                    <button
                      key={m}
                      onClick={() => onMarkChange(String(m))}
                      className={`w-11 h-11 text-sm font-bold border transition-colors ${parseFloat(manualMark) === m
                        ? m === 0
                          ? "bg-rose-600 border-rose-700 text-white"
                          : m === maxMarks
                            ? "bg-teal-600 border-teal-700 text-white"
                            : "bg-brand-600 border-brand-700 text-white"
                        : "bg-white border-stone-300 text-stone-700 hover:bg-stone-100"
                        }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {/* Manual input fallback */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={question.marks}
                    step={0.5}
                    value={manualMark}
                    onChange={(e) => onMarkChange(e.target.value)}
                    className="w-24 border border-stone-300 px-3 py-2 text-sm font-mono text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  />
                  <span className="text-stone-400 text-sm">/ {question.marks} marks</span>
                  {parseFloat(manualMark) > 0 && (
                    <span className="ml-auto text-teal-700 text-sm font-semibold">
                      +{manualMark} awarded
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prev / Next navigation */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-stone-100 bg-stone-50/50">
        <button
          onClick={onPrev}
          disabled={flatIndex === 0}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-600 bg-white border-2 border-stone-200 px-5 py-2.5 rounded-lg hover:bg-white hover:border-brand-200 hover:text-brand-700 shadow-sm active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Previous
        </button>
        <span className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] tabular-nums">
          #{flatIndex + 1} <span className="opacity-30">/</span> {total}
        </span>
        <button
          onClick={onNext}
          disabled={flatIndex === total - 1}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-600 bg-white border-2 border-stone-200 px-5 py-2.5 rounded-lg hover:bg-white hover:border-brand-200 hover:text-brand-700 shadow-sm active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main modal ──────────────────────────────��─────────────────────────────────


export function StudentDetailModal({
  student,
  onClose,
  onRefresh,
  isAdmin,
  passMark = 0,
  exams = [],
  centres = [],
  streams = [],
  sets = [],
}: {
  student: AdminStudent;
  onClose: () => void;
  onRefresh: () => void;
  isAdmin: boolean;
  passMark?: number;
  exams?: import("../../../types").Exam[];
  centres?: Centre[];
  streams?: import("../../../types").StreamDef[];
  sets?: import("../../../types").StreamDef[];
  questions?: QuestionRow[];
}) {
  const effectivePassMark = passMark > 0 ? passMark : null;
  type ModalTab = "overview" | "answers" | "strikes" | "timeline";
  const [tab, setTab] = useState<ModalTab>("overview");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [manualMarks, setManualMarks] = useState<Record<string, string>>({});
  const [scoreOverride, setScoreOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [activeQIndex, setActiveQIndex] = useState(0);
  const [password, setPassword] = useState<string | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [timeline, setTimeline] = useState<{ start_time: string | null; answers: { question_id: number; section: number; question_number: number; type: string; answer: string; answered_at: string }[] } | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [reassignExamId, setReassignExamId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignMsg, setReassignMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name_en: "", name_ar: "", dob: "", phone: "",
    stream: "", course: "", email: "", centre_id: "",
    paper_set: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const answersLoaded = useRef(false);
  const timelineLoaded = useRef(false);

  // When student is reset (status → pending), clear stale answers/timeline so they reload fresh
  useEffect(() => {
    if (student.status === "pending") {
      answersLoaded.current = false;
      timelineLoaded.current = false;
      setQuestions([]);
    }
  }, [student.status]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Load questions when Answers tab opens
  // useEffect(() => {
  //   if (tab === "answers" && !answersLoaded.current) {
  //     answersLoaded.current = true;
  //     setQuestionsLoading(true);
  //     api.questions
  //       .list({ paper_set: student.paper_set })
  //       .then((qs) => {
  //         setQuestions(qs);
  //         const init: Record<string, string> = {};
  //         qs.forEach((q) => {
  //           if (q.type === "fill_blank" || q.type === "descriptive") init[String(q.id)] = "0";
  //         });
  //         setManualMarks(init);
  //       })
  //       .catch(() => {})
  //       .finally(() => setQuestionsLoading(false));
  //   }
  // }, [tab, student.paper_set]);

  useEffect(() => {
    if (tab !== "answers" || answersLoaded.current) return;
    answersLoaded.current = true;
    setQuestionsLoading(true);

    Promise.all([
      api.admin.studentView(student.roll_number), // shuffled, for display
      api.questions.list({ paper_set: student.paper_set }), // original, for correct_answer
    ])
      .then(([{ questions: shuffled }, originals]) => {
        // Merge: use shuffled options/text, but attach correct_answer from originals
        const originalsById = Object.fromEntries(
          originals.map((q) => [q.id, q]),
        );

        // If student hasn't started, shuffled will be empty — fall back to originals
        const base = shuffled.length > 0 ? shuffled : originals;

        const merged = base.map((q) => ({
          ...q,
          paper_set: student.paper_set,
          // Prefer backend-provided correct_answer (which is shuffle-aware)
          correct_answer: q.correct_answer || originalsById[q.id]?.correct_answer || "",
        }));
        setQuestions(merged);

        const init: Record<string, string> = {};
        merged.forEach((q) => {
          if (q.type === "fill_blank" || q.type === "descriptive")
            init[String(q.id)] = "0";
        });
        setManualMarks(init);
      })
      .catch(() => { })
      .finally(() => setQuestionsLoading(false));
  }, [tab, student.roll_number, student.paper_set]);

  // Load timeline when Timeline tab opens
  useEffect(() => {
    if (tab === "timeline" && !timelineLoaded.current) {
      timelineLoaded.current = true;
      setTimelineLoading(true);
      api.admin.answerTimeline(student.roll_number)
        .then(setTimeline)
        .catch(() => { })
        .finally(() => setTimelineLoading(false));
    }
  }, [tab, student.roll_number]);

  // Auto-score (MCQ + T/F)
  const autoScore = useMemo(() =>
    questions.reduce((sum, q) => {
      if (q.type !== "mcq" && q.type !== "true_false") return sum;
      const ans = (student.answers || {})[String(q.id)] ?? "";
      return ans && ans === q.correct_answer ? sum + (q.marks ?? 1) : sum;
    }, 0),
    [questions, student.answers]);

  const manualScore = useMemo(() =>
    Object.values(manualMarks).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [manualMarks]);

  const computedTotal = autoScore + manualScore;

  // Flat ordered question list (section-sorted)
  const flatQuestions = useMemo(() => {
    return [...questions].sort((a, b) =>
      a.section !== b.section ? a.section - b.section : a.question_number - b.question_number,
    );
  }, [questions]);

  // Section groups for sidebar
  const sectionGroups = useMemo(() => {
    const map = new Map<number, QuestionRow[]>();
    flatQuestions.forEach((q) => {
      if (!map.has(q.section)) map.set(q.section, []);
      map.get(q.section)!.push(q);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [flatQuestions]);

  const handleSaveGrade = async () => {
    const finalScore = scoreOverride.trim() !== "" ? parseFloat(scoreOverride) : computedTotal;
    if (isNaN(finalScore)) {
      setSaveMsg({ ok: false, text: "Score is invalid. Enter a value manually in the override field." });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await api.admin.gradeStudent(student.roll_number, finalScore);
      if (res && res.updated) {
        setSaveMsg({ ok: true, text: `Score saved: ${finalScore}` });
        onRefresh();
      } else {
        setSaveMsg({ ok: false, text: "Save completed but student record not updated (check roll number)." });
      }
    } catch (err: any) {
      console.error("Grading failed:", err);
      const msg = err instanceof ApiError ? err.message : err.message || "Failed to save score.";
      setSaveMsg({ ok: false, text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Reset exam for ${student.name_en}? All progress will be lost.`)) return;
    setResetting(true);
    try {
      await api.admin.resetStudent(student.roll_number);
      onRefresh();
      onClose();
    } finally {
      setResetting(false);
    }
  };

  const handleReopen = async () => {
    if (!confirm(`Reopen exam for ${student.name_en}? They will be able to continue from where they left off.`)) return;
    setReopening(true);
    try {
      await api.admin.reopenStudent(student.roll_number);
      onRefresh();
      onClose();
    } finally {
      setReopening(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignExamId) return;
    setReassigning(true);
    setReassignMsg(null);
    try {
      await api.admin.assignExam(student.roll_number, Number(reassignExamId));
      const exam = exams.find((e) => e.id === Number(reassignExamId));
      setReassignMsg({ ok: true, text: `Moved to: ${exam?.name ?? reassignExamId}` });
      setReassignExamId("");
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Reassignment failed";
      setReassignMsg({ ok: false, text: msg });
    } finally {
      setReassigning(false);
    }
  };

  const handleStartEdit = () => {
    // We expect dob and phone to be directly on the student object from the admin API.
    // However we'll handle common alternative names just in case some paths return different schemas.
    const rawDob = student.dob || (student as any).date_of_birth || (student as any).DOB || "";
    const rawPhone = student.phone || (student as any).phone_number || student.roll_number || "";

    setEditForm({
      name_en: student.name_en || "",
      name_ar: student.name_ar || "",
      dob: rawDob ? String(rawDob).trim() : "",
      phone: rawPhone ? String(rawPhone).trim() : "",
      stream: student.stream || "general",
      course: student.course || "UG",
      email: student.email || "",
      centre_id: student.centre_id ? String(student.centre_id) : "",
      paper_set: student.paper_set || "A",
    });
    setEditing(true);
    setEditError("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError("");
    try {
      const res = await api.admin.updateStudent(student.roll_number, {
        name_en: editForm.name_en,
        name_ar: editForm.name_ar,
        dob: editForm.dob,
        phone: editForm.phone,
        stream: editForm.stream as import("../../../types").Stream,
        course: editForm.course,
        email: editForm.email,
        centre_id: editForm.centre_id ? Number(editForm.centre_id) : undefined,
        paper_set: editForm.paper_set,
      });
      if (res.updated) {
        setEditing(false);
        onRefresh();
      }
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update student");
    } finally {
      setEditSaving(false);
    }
  };

  const progress = student.total_questions
    ? Math.round((student.answered_count / student.total_questions) * 100)
    : 0;

  const modalTabs: { id: ModalTab; label: string; badge?: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "answers", label: "Answers & Grade", badge: String(student.answered_count) },
    { id: "strikes", label: "Violations", badge: student.strike_log?.length ? String(student.strike_log.length) : undefined },
    { id: "timeline", label: "Timeline" },
  ];

  const activeQ = flatQuestions[activeQIndex];

  // Count questions needing manual grading
  const needsManual = questions.filter(
    (q) => q.type === "fill_blank" || q.type === "descriptive",
  ).length;
  const gradedManual = Object.values(manualMarks).filter((v) => parseFloat(v) > 0).length;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">
      <div
        className="relative w-full flex flex-col overflow-hidden flex-1"
      >

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-brand-800/20 bg-gradient-to-r from-brand-900 via-brand-950 to-brand-900 flex-shrink-0 relative">
          {/* Subtle logo background */}
          <div className="absolute top-0 right-0 p-8 opacity-5 -mr-12 -mt-10 pointer-events-none">
            <User className="w-48 h-48 text-white" />
          </div>

          <div className="flex items-center gap-3 sm:gap-4 min-w-0 relative z-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10">
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-gold-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <p className="text-white font-black text-lg sm:text-2xl tracking-tight leading-tight uppercase">{student.name_en}</p>
                {student.name_ar && (
                  <p className="text-white/80 font-arabic text-xl sm:text-3xl tracking-wide" dir="rtl">{student.name_ar}</p>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-brand-300 text-[10px] font-black font-mono tracking-widest uppercase">{student.roll_number}</p>
                <span className="w-1 h-1 rounded-full bg-brand-700" />
                <p className="text-brand-300 text-[10px] font-black tracking-widest uppercase">{student.stream}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 ml-4 flex-shrink-0 relative z-10">
            {/* Score pill */}
            {student.score != null && (
              <div className={`px-4 py-1.5 text-sm font-black tabular-nums rounded-xl shadow-lg ${effectivePassMark == null
                ? "bg-brand-800 border border-brand-700/50 text-white"
                : (student.score || 0) >= effectivePassMark
                  ? "bg-emerald-600 border border-emerald-500/50 text-white"
                  : "bg-rose-600 border border-rose-500/50 text-white"
                }`}>
                {student.score}
              </div>
            )}

            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center text-brand-300 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex border-b border-stone-200 bg-white flex-shrink-0 overflow-x-auto">
          {modalTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === t.id
                ? "border-brand-600 text-brand-700 bg-brand-50/50"
                : "border-transparent text-stone-500 hover:text-stone-900"
                }`}
            >
              {t.label}
              {t.badge && (
                <span className={`text-xs px-1.5 py-0.5 font-semibold rounded-sm ${tab === t.id ? "bg-brand-100 text-brand-700" : "bg-stone-100 text-stone-500"
                  }`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 min-h-0 overflow-hidden">

          {/* ── Overview tab ── */}
          {tab === "overview" && (
            <div className="h-full overflow-y-auto">
              <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left: details */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Student Information</h3>
                    <button
                      onClick={handleStartEdit}
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-brand-600 hover:text-brand-800 transition-colors"
                    >
                      <Edit className="w-3 h-3" />
                      Edit Info
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Detail label="Roll Number" value={student.roll_number || "—"} />
                    <Detail label="Date of Birth" value={student.dob || (student as any).date_of_birth || "—"} />
                    <Detail label="Phone Number" value={student.phone || (student as any).phone_number || student.roll_number || "—"} />
                    <Detail label="Stream" value={student.stream || "—"} />
                    <Detail label="Course" value={student.course || "—"} />
                    <Detail label="Centre" value={student.centre_name || "—"} />
                    <Detail label="Paper Set" value={student.paper_set || "—"} />
                    <Detail label="Started" value={formatDateTime(student.start_time)} />
                    <Detail label="Submitted" value={formatDateTime(student.submit_time)} />
                  </div>

                  {/* Password lookup */}
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold mb-1.5">
                      Exam Password
                    </p>
                    {password ? (
                      <div className="flex items-center gap-2">
                        <code className="bg-stone-100 border border-stone-200 px-3 py-1.5 text-sm font-mono text-stone-900 select-all">
                          {password}
                        </code>
                        <button
                          onClick={() => setPassword(null)}
                          className="text-xs text-stone-400 hover:text-stone-600"
                        >
                          Hide
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          setPwdLoading(true);
                          try {
                            const r = await api.admin.getPassword(student.roll_number);
                            setPassword(r.password);
                          } catch { /* ignore */ }
                          finally { setPwdLoading(false); }
                        }}
                        disabled={pwdLoading}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-700 border-2 border-stone-200 px-4 h-9 hover:bg-stone-50 transition-all disabled:opacity-50 rounded-lg shadow-sm"
                      >
                        {pwdLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <User className="w-3.5 h-3.5" />}
                        Reveal Password
                      </button>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium">
                      <span>Exam Progress</span>
                      <span>{student.answered_count}/{student.total_questions} answered ({progress}%)</span>
                    </div>
                    <div className="h-3 bg-stone-100 border border-stone-200 overflow-hidden rounded-full">
                      <div className="h-full bg-brand-600 transition-all rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Progress", value: `${student.answered_count}/${student.total_questions ?? "?"}` },
                      { label: "Strikes", value: String(student.strikes ?? 0), danger: (student.strikes ?? 0) > 0 },
                      { label: "Set", value: student.paper_set || "—" },
                    ].map(({ label, value, danger }) => (
                      <div key={label} className="bg-stone-50 border border-stone-200 px-3 py-3 text-center rounded-lg">
                        <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">{label}</p>
                        <p className={`font-bold text-lg tabular-nums mt-0.5 ${danger ? "text-rose-600" : "text-stone-900"}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                </div>

                {/* Right: score + actions */}
                <div className="space-y-4">
                  {(student.status === "submitted" || student.status === "flagged") && (
                    <div className={`p-5 border-2 flex items-center justify-between rounded-lg ${effectivePassMark == null
                      ? "bg-stone-50 border-stone-200"
                      : (student.score || 0) >= effectivePassMark
                        ? "bg-teal-50 border-teal-300"
                        : "bg-rose-50 border-rose-300"
                      }`}>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-stone-500 mb-1">
                          Final Score
                        </p>
                        <p className={`text-5xl sm:text-7xl font-black tabular-nums ${effectivePassMark == null
                          ? "text-stone-900"
                          : (student.score || 0) >= effectivePassMark
                            ? "text-teal-800"
                            : "text-rose-700"
                          }`}>
                          {student.score ?? "—"}
                        </p>
                        {student.score != null && effectivePassMark != null && (
                          <p className={`text-sm font-semibold mt-1 ${(student.score || 0) >= effectivePassMark ? "text-teal-700" : "text-rose-600"
                            }`}>
                            {(student.score || 0) >= effectivePassMark ? "PASS" : "FAIL"}
                          </p>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => setTab("answers")}
                          className="text-sm font-medium text-stone-700 border border-stone-300 bg-white px-4 h-9 hover:bg-stone-50 transition-colors shadow-sm"
                        >
                          Grade / Review →
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Exam assignment ── */}
                  {isAdmin && exams.length > 0 && (
                    <div className="border border-stone-200 bg-stone-50 p-4">
                      <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold mb-3">
                        Exam Assignment
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-stone-600">
                          Currently:{" "}
                          <span className="font-semibold text-stone-900">
                            {exams.find((e) => e.id === student.exam_id)?.name ?? "Unassigned"}
                          </span>
                        </span>
                        {student.status === "pending" ? (
                          <>
                            <select
                              value={reassignExamId}
                              onChange={(e) => { setReassignExamId(e.target.value); setReassignMsg(null); }}
                              className="border border-stone-300 px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none rounded-lg"
                            >
                              <option value="">— Move to exam —</option>
                              {exams
                                .filter((e) => e.id !== student.exam_id)
                                .map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.name} ({e.code})
                                  </option>
                                ))}
                            </select>
                            <button
                              onClick={handleReassign}
                              disabled={!reassignExamId || reassigning}
                              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-700 border-2 border-brand-200 px-4 h-9 hover:bg-brand-50 transition-all disabled:opacity-50 rounded-lg shadow-sm"
                            >
                              {reassigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              Reassign
                            </button>


                          </>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1">
                            Reset exam first to reassign
                          </span>
                        )}
                      </div>
                      {reassignMsg && (
                        <p className={`text-xs mt-2 font-medium ${reassignMsg.ok ? "text-teal-700" : "text-rose-600"}`}>
                          {reassignMsg.text}
                        </p>
                      )}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex gap-3 flex-wrap">
                      {student.status === "submitted" && (
                        <button
                          onClick={handleReopen}
                          disabled={reopening}
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-700 border-2 border-teal-200 px-4 h-10 hover:bg-teal-50 transition-all disabled:opacity-50 rounded-lg shadow-sm bg-white"
                        >
                          {reopening ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Reopen Exam
                        </button>
                      )}
                      <button
                        onClick={handleReset}
                        disabled={resetting}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-rose-700 border-2 border-rose-200 px-4 h-10 hover:bg-rose-50 transition-all disabled:opacity-50 rounded-lg shadow-sm bg-white"
                      >
                        {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Reset Exam
                      </button>
                      <button
                        onClick={() => exportStudentsCsv([student], `${student.roll_number}.csv`)}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-700 border-2 border-stone-200 px-4 h-10 hover:bg-stone-50 transition-all rounded-lg shadow-sm bg-white"
                      >
                        <Download className="w-4 h-4" />
                        Export Row
                      </button>




                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Answers & Grade tab ── */}
          {tab === "answers" && (
            <div className="h-full flex flex-col">
              {questionsLoading ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                  <p className="text-stone-500 text-sm">Loading questions…</p>
                </div>
              ) : flatQuestions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
                  No questions found for Paper Set {student.paper_set}.
                </div>
              ) : (
                <>
                  {/* ── Grade summary bar ── */}
                  {isAdmin && (
                    <div className="flex-shrink-0 border-b border-stone-200 bg-stone-50 px-4 sm:px-5 py-3">
                      <div className="flex items-center gap-4 flex-wrap">
                        {/* Score breakdown */}
                        <div className="flex items-center gap-3 text-sm sm:text-base">
                          <div className="flex items-center gap-1.5">
                            <span className="text-stone-400">Auto</span>
                            <span className="font-bold text-stone-900 tabular-nums text-lg">{autoScore}</span>
                          </div>
                          <span className="text-stone-300 font-light">+</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-stone-400">Manual</span>
                            <span className="font-bold text-stone-900 tabular-nums text-lg">{manualScore.toFixed(1)}</span>
                          </div>
                          <span className="text-stone-300 font-light">=</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-stone-500 font-medium">Total</span>
                            <span className="font-black text-2xl sm:text-3xl tabular-nums text-brand-700">{computedTotal.toFixed(1)}</span>
                          </div>
                        </div>

                        {/* Manual grading progress */}
                        {needsManual > 0 && (
                          <div className="flex items-center gap-2 text-xs text-stone-500 border-l border-stone-200 pl-4">
                            <span className={`w-2 h-2 rounded-full ${gradedManual === needsManual ? "bg-teal-500" : "bg-amber-400"}`} />
                            {gradedManual}/{needsManual} manual questions graded
                          </div>
                        )}

                        {/* Save controls */}
                        <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto">
                          <input
                            type="number"
                            value={scoreOverride}
                            onChange={(e) => setScoreOverride(e.target.value)}
                            placeholder={`${computedTotal.toFixed(1)} (override)`}
                            className="flex-1 lg:w-36 border border-stone-300 px-3 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={handleSaveGrade}
                            disabled={saving}
                            className="flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 text-white text-[10px] font-bold uppercase tracking-widest px-6 h-10 transition-all disabled:opacity-50 shadow-md shadow-brand-900/10 rounded-lg whitespace-nowrap"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Grade
                          </button>
                        </div>
                        {saveMsg && (
                          <div className={`w-full text-xs font-medium px-3 py-2 border ${saveMsg.ok
                            ? "bg-teal-50 border-teal-200 text-teal-800"
                            : "bg-rose-50 border-rose-200 text-rose-800"
                            }`}>
                            {saveMsg.text}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Section-wise score summary ── */}
                  {sectionGroups.length > 0 && (
                    <div className="flex-shrink-0 border-b border-stone-200 bg-white px-4 sm:px-5 py-2 flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Sections</span>
                      {sectionGroups.map(([section, sqs]) => {
                        const autoCorrect = sqs.filter((q) => {
                          if (q.type !== "mcq" && q.type !== "true_false") return false;
                          const ans = (student.answers || {})[String(q.id)] ?? "";
                          return ans && ans === q.correct_answer;
                        }).length;
                        const autoTotal = sqs.filter((q) => q.type === "mcq" || q.type === "true_false").length;
                        const hasManual = sqs.some((q) => q.type === "fill_blank" || q.type === "descriptive");
                        return (
                          <div key={section} className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2.5 py-1">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-stone-500">§{section}</span>
                            <span className={`text-sm font-bold tabular-nums ${autoCorrect === autoTotal && autoTotal > 0 ? "text-teal-700" : autoCorrect === 0 && autoTotal > 0 ? "text-rose-600" : "text-stone-800"}`}>
                              {autoCorrect}/{autoTotal}
                            </span>
                            {hasManual && <span className="text-[10px] text-amber-500 font-semibold">+manual</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Two-panel layout ── */}
                  <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
                    {/* ── Left: question navigator sidebar ── */}
                    <div className="w-full lg:w-64 h-32 lg:h-full flex-shrink-0 border-b lg:border-b-0 lg:border-r border-stone-200 overflow-y-auto bg-stone-50">
                      {sectionGroups.map(([section, sqs]) => {
                        // Count answered in section
                        const answered = sqs.filter((q) => (student.answers || {})[String(q.id)]?.trim()).length;
                        return (
                          <div key={section}>
                            {/* Section header */}
                            <div className="px-3 py-2 bg-stone-200/70 border-b border-stone-300 sticky top-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-600">
                                  Section {section}
                                </span>
                                <span className="text-[10px] text-stone-400 font-mono">{answered}/{sqs.length}</span>
                              </div>
                            </div>

                            {/* Question items - Grid on mobile for easier tapping */}
                            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-1">
                              {sqs.map((q) => {
                                const ans = (student.answers || {})[String(q.id)] ?? "";
                                const mark = manualMarks[String(q.id)] ?? "0";
                                const status = getQStatus(q, ans, mark);
                                const flatIdx = flatQuestions.findIndex((fq) => fq.id === q.id);
                                const isActive = flatIdx === activeQIndex;

                                return (
                                  <button
                                    key={q.id}
                                    onClick={() => setActiveQIndex(flatIdx)}
                                    className={`flex items-center gap-2 lg:gap-2.5 px-3 py-2.5 border-b border-r lg:border-r-0 border-stone-200/60 transition-colors text-left ${isActive
                                      ? "bg-brand-50 border-l-2 border-l-brand-600"
                                      : "hover:bg-white border-l-2 border-l-transparent"
                                      }`}
                                  >
                                    {/* Status dot - only on desktop or larger mobile */}
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_Q[status]}`} />

                                    {/* Q number */}
                                    <span className={`text-xs font-bold tabular-nums w-4 lg:w-6 flex-shrink-0 ${isActive ? "text-brand-700" : "text-stone-500"
                                      }`}>
                                      {q.question_number}
                                    </span>

                                    {/* Type tag - hidden on mobile grid */}
                                    <span className="hidden lg:block text-[10px] text-stone-400 uppercase tracking-wide flex-1 truncate">
                                      {q.type === "mcq" ? "MCQ" :
                                        q.type === "true_false" ? "T/F" :
                                          q.type === "fill_blank" ? "Fill" : "Desc"}
                                    </span>

                                    {/* Status icon / mark - compact on mobile */}
                                    <span className="flex-shrink-0 ml-auto">
                                      {(q.type === "fill_blank" || q.type === "descriptive") ? (
                                        <span className={`text-[9px] lg:text-[10px] font-bold tabular-nums ${parseFloat(mark) > 0 ? "text-teal-600" : "text-amber-500"
                                          }`}>
                                          {mark}
                                        </span>
                                      ) : (
                                        <span className="scale-75 lg:scale-100">
                                          {STATUS_ICON_Q[status]}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Right: question detail panel ── */}
                    <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                      {activeQ ? (
                        <QuestionGrader
                          question={activeQ}
                          student={student}
                          studentAnswer={(student.answers || {})[String(activeQ.id)] ?? ""}
                          manualMark={manualMarks[String(activeQ.id)] ?? "0"}
                          onMarkChange={(v) =>
                            setManualMarks((prev) => ({ ...prev, [String(activeQ.id)]: v }))
                          }
                          isAdmin={isAdmin}
                          flatIndex={activeQIndex}
                          total={flatQuestions.length}
                          onPrev={() => setActiveQIndex((i) => Math.max(0, i - 1))}
                          onNext={() => setActiveQIndex((i) => Math.min(flatQuestions.length - 1, i + 1))}
                        />
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
                          Select a question from the list.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Strike Log tab ── */}
          {tab === "strikes" && (
            <div className="h-full overflow-y-auto p-5 sm:p-6">
              {!student.strike_log?.length ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-14 h-14 bg-stone-100 flex items-center justify-center mb-3">
                    <CheckCircle className="w-7 h-7 text-stone-400" />
                  </div>
                  <p className="text-stone-500 text-sm font-medium">No violations recorded</p>
                  <p className="text-stone-400 text-xs mt-1">This student completed the exam cleanly.</p>
                </div>
              ) : (
                <div className="max-w-xl space-y-2">
                  <p className="text-xs text-stone-400 uppercase tracking-widest font-semibold mb-4">
                    {student.strike_log.length} violation{student.strike_log.length !== 1 ? "s" : ""} recorded
                  </p>
                  {student.strike_log.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 bg-rose-50 border border-rose-200">
                      <div className="w-7 h-7 bg-rose-200 text-rose-800 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-rose-900 text-sm font-semibold capitalize">
                          {ev.event.replace(/_/g, " ")}
                        </p>
                        <p className="text-rose-500 text-xs font-mono mt-0.5">
                          {formatDateTime(ev.time)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* ── Timeline tab ── */}
          {tab === "timeline" && (
            <div className="h-full overflow-y-auto p-5 sm:p-6">
              {timelineLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
              ) : !timeline || timeline.answers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <p className="text-stone-500 text-sm">No answer timestamps recorded yet.</p>
                </div>
              ) : (
                <div className="max-w-2xl">
                  {/* Header info */}
                  <div className="flex items-center gap-6 mb-6 text-xs text-stone-500">
                    {timeline.start_time && (
                      <span>
                        <span className="font-semibold text-stone-700">Exam started:</span>{" "}
                        {new Date(timeline.start_time).toLocaleTimeString()}
                      </span>
                    )}
                    <span>
                      <span className="font-semibold text-stone-700">{timeline.answers.length}</span> questions answered
                    </span>
                  </div>

                  {/* Timeline entries */}
                  <div className="relative">
                    <div className="absolute left-[72px] top-0 bottom-0 w-px bg-stone-200" />
                    <div className="space-y-1">
                      {timeline.answers.map((entry, i) => {
                        const answeredAt = new Date(entry.answered_at);
                        const startAt = timeline.start_time ? new Date(timeline.start_time) : null;
                        const elapsedMs = startAt ? answeredAt.getTime() - startAt.getTime() : null;
                        const elapsedMin = elapsedMs !== null ? Math.floor(elapsedMs / 60000) : null;
                        const elapsedSec = elapsedMs !== null ? Math.floor((elapsedMs % 60000) / 1000) : null;

                        const TYPE_COLOR: Record<string, string> = {
                          mcq: "bg-brand-100 text-brand-700",
                          true_false: "bg-violet-100 text-violet-700",
                          fill_blank: "bg-gold-100 text-gold-700",
                          descriptive: "bg-orange-100 text-orange-700",
                        };

                        return (
                          <div key={entry.question_id} className="flex items-center gap-4 py-1.5">
                            {/* Time column */}
                            <div className="w-16 text-right flex-shrink-0">
                              <span className="text-[10px] font-mono text-stone-400 tabular-nums">
                                {answeredAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                            </div>

                            {/* Dot */}
                            <div className="w-3 h-3 rounded-full bg-white border-2 border-stone-300 flex-shrink-0 relative z-10" />

                            {/* Content */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs text-stone-500 font-medium flex-shrink-0">
                                Section {entry.section}·Q{entry.question_number}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 flex-shrink-0 ${TYPE_COLOR[entry.type] ?? "bg-stone-100 text-stone-600"}`}>
                                {entry.type.replace("_", " ").toUpperCase()}
                              </span>
                              <span className="text-xs text-stone-700 truncate font-mono">
                                {entry.answer || <em className="text-stone-300">blank</em>}
                              </span>
                              {elapsedMin !== null && elapsedSec !== null && (
                                <span className="text-[10px] text-stone-400 ml-auto flex-shrink-0 tabular-nums">
                                  +{elapsedMin}m{elapsedSec}s
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ── Edit Modal ── */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(false)}>
          <div className="bg-white border border-stone-200 shadow-2xl w-full max-w-md rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-stone-100 bg-stone-50">
              <h2 className="text-base font-bold text-stone-900 uppercase tracking-tight">Edit Student Info</h2>
              <button onClick={() => setEditing(false)} className="text-stone-400 hover:text-stone-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Roll Number (Unique ID)</label>
                  <input value={student.roll_number} readOnly disabled
                    className="w-full border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-mono text-stone-400 rounded-lg cursor-not-allowed" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Name (English) *</label>
                  <input value={editForm.name_en} onChange={(e) => setEditForm(f => ({ ...f, name_en: e.target.value }))} required
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Name (Arabic)</label>
                  <input value={editForm.name_ar} onChange={(e) => setEditForm(f => ({ ...f, name_ar: e.target.value }))} dir="rtl"
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">DOB (DDMMYYYY) *</label>
                  <input value={editForm.dob} onChange={(e) => setEditForm(f => ({ ...f, dob: e.target.value }))} required placeholder="15032005"
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Phone *</label>
                  <input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} required type="tel"
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Stream</label>
                  <select value={editForm.stream} onChange={(e) => setEditForm(f => ({ ...f, stream: e.target.value }))}
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg bg-white">
                    {streams.length > 0 ? (
                      streams.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name.charAt(0).toUpperCase() + s.name.slice(1)}
                        </option>
                      ))
                    ) : (
                      ["commerce", "science", "humanities", "general"].map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Course</label>
                  <input value={editForm.course} onChange={(e) => setEditForm(f => ({ ...f, course: e.target.value }))}
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Centre</label>
                  <select value={editForm.centre_id} onChange={(e) => setEditForm(f => ({ ...f, centre_id: e.target.value }))}
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg bg-white">
                    <option value="">— None —</option>
                    {centres.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">Paper Set</label>
                  <select value={editForm.paper_set} onChange={(e) => setEditForm(f => ({ ...f, paper_set: e.target.value }))}
                    className="w-full border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg bg-white">
                    {(sets || []).map((s) => (
                      <option key={s.id} value={s.name}>Set {s.name}</option>
                    ))}
                    {(!sets || sets.length === 0) && (
                      <>
                        <option value="A">Set A</option>
                        <option value="B">Set B</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {editError && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{editError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(false)}
                  className="flex-1 border-2 border-stone-200 text-stone-600 text-[10px] font-bold uppercase tracking-widest h-10 hover:bg-stone-50 transition-all rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={editSaving}
                  className="flex-1 bg-brand-700 text-white text-[10px] font-bold uppercase tracking-widest h-10 hover:bg-brand-800 disabled:opacity-60 transition-all flex items-center justify-center gap-2 rounded-lg shadow-md shadow-brand-900/10">
                  {editSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
