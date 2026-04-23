import { useState, useEffect } from "react";
import { api, ApiError } from "../../../api/client";
import type { Exam } from "../../../types";
import { Plus, Loader2, Pencil, Trash2, Send, CheckCircle2, X, ExternalLink, Info } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-stone-100 text-stone-600 border-stone-200",
  active:    "bg-brand-50 text-brand-700 border-brand-200",
  completed: "bg-teal-50 text-teal-700 border-teal-200",
  archived:  "bg-stone-50 text-stone-400 border-stone-200",
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function SectionDurationEditor({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  const sections = [1, 2, 3, 4, 5];
  return (
    <div className="grid grid-cols-5 gap-2">
      {sections.map((s) => (
        <div key={s}>
          <label className="text-xs text-stone-500 font-medium block mb-1">§{s} (min)</label>
          <input
            type="number"
            min={0}
            value={value[String(s)] ?? ""}
            onChange={(e) => {
              const num = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
              const next = { ...value };
              if (num == null || isNaN(num) || num === 0) {
                delete next[String(s)];
              } else {
                next[String(s)] = num;
              }
              onChange(next);
            }}
            placeholder="∞"
            className="w-full border border-stone-300 px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg"
          />
        </div>
      ))}
    </div>
  );
}

function SectionDescriptionEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const sections = [1, 2, 3, 4, 5];
  return (
    <div className="space-y-2">
      {sections.map((s) => (
        <div key={s} className="flex items-center gap-2">
          <span className="text-xs text-stone-500 font-medium w-12">§{s}</span>
          <input
            type="text"
            value={value[String(s)] ?? ""}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value === "") {
                delete next[String(s)];
              } else {
                next[String(s)] = e.target.value;
              }
              onChange(next);
            }}
            placeholder="Optional instructions for students (shown when section starts)"
            className="flex-1 border border-stone-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg"
          />
        </div>
      ))}
    </div>
  );
}

function ExamFormPage({
  exam,
  onSave,
  onClose,
}: {
  exam?: Exam | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const isEdit = !!exam;
  const [form, setForm] = useState({
    name:                   exam?.name ?? "",
    name_ar:                exam?.name_ar ?? "",
    code:                   exam?.code ?? "",
    exam_start_time:        toLocalInput(exam?.exam_start_time),
    exam_duration_minutes:  exam?.exam_duration_minutes ?? 180,
    grace_minutes:          exam?.grace_minutes ?? 0,
    pass_mark:              exam?.pass_mark ?? 0,
    ip_restriction:         exam?.ip_restriction ?? false,
    allowed_ip_ranges:      (exam?.allowed_ip_ranges ?? []).join("\n"),
    test_mode:              exam?.test_mode ?? false,
    results_publish_time:   toLocalInput(exam?.results_publish_time),
    section_durations:      exam?.section_durations ?? {} as Record<string, number>,
    section_descriptions:   exam?.section_descriptions ?? {} as Record<string, string>,
    section_auto_advance:   exam?.section_auto_advance ?? true,
    shuffle_questions:      exam?.shuffle_questions ?? true,
    notify_email:           exam?.notify_email ?? false,
    notify_sms:             exam?.notify_sms ?? false,
    status:                 exam?.status ?? "draft",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: Partial<Exam> = {
        name:                   form.name,
        name_ar:                form.name_ar,
        code:                   form.code.toUpperCase(),
        exam_duration_minutes: Number(form.exam_duration_minutes),
        grace_minutes:          Number(form.grace_minutes),
        pass_mark:              Number(form.pass_mark),
        ip_restriction:         form.ip_restriction,
        allowed_ip_ranges:      form.allowed_ip_ranges.split("\n").map((s) => s.trim()).filter(Boolean),
        test_mode:              form.test_mode,
        section_durations:      form.section_durations,
        section_descriptions:   form.section_descriptions,
        section_auto_advance:   form.section_auto_advance,
        shuffle_questions:      form.shuffle_questions,
        notify_email:           form.notify_email,
        notify_sms:             form.notify_sms,
        status:                 form.status as Exam["status"],
      };
      if (form.exam_start_time)
        payload.exam_start_time = new Date(form.exam_start_time).toISOString();
      if (form.results_publish_time)
        payload.results_publish_time = new Date(form.results_publish_time).toISOString();

      if (isEdit) {
        await api.exams.update(exam!.id, payload);
      } else {
        await api.exams.create(payload);
      }
      onSave();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 border-2 border-stone-200 px-4 h-9 hover:bg-stone-50 transition-all rounded-lg"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
        <h2 className="text-xl font-semibold text-stone-900">
          {isEdit ? "Edit Exam" : "Create New Exam"}
        </h2>
      </div>

      <div className="bg-white border border-stone-200 shadow-sm w-full max-w-2xl rounded-lg overflow-hidden">
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Name (EN) *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} required
                className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Name (AR)</label>
              <input value={form.name_ar} onChange={(e) => set("name_ar", e.target.value)} dir="rtl"
                className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Code * <span className="text-stone-400 font-normal normal-case">(used by students to select exam)</span></label>
              <input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} required
                disabled={isEdit}
                className="w-full border border-stone-300 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-stone-50 disabled:text-stone-400 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}
                className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Timing */}
          <div className="border border-stone-100 bg-stone-50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Timing</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-600 font-medium block mb-1">Start Time</label>
                <input type="datetime-local" value={form.exam_start_time}
                  onChange={(e) => set("exam_start_time", e.target.value)}
                  className="w-full border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
              </div>
              <div>
                <label className="text-xs text-stone-600 font-medium block mb-1">Duration (min)</label>
                <input type="number" min={1} value={form.exam_duration_minutes}
                  onChange={(e) => set("exam_duration_minutes", Number(e.target.value))}
                  className="w-full border border-stone-300 px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-stone-600 font-medium block mb-1">
                  Grace Period (min after start)
                </label>
                <input type="number" min={0} value={form.grace_minutes}
                  onChange={(e) => set("grace_minutes", Number(e.target.value))}
                  placeholder="0"
                  className="w-full border border-stone-300 px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[10px] text-stone-400 mt-0.5 flex items-center gap-0.5">
                  <Info className="w-2.5 h-2.5" /> 0 = no limit on late logins
                </p>
              </div>
            </div>
          </div>

          {/* Section timing */}
          <div className="border border-stone-100 bg-stone-50 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Section Time Limits</p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input type="checkbox" checked={form.section_auto_advance}
                    onChange={(e) => set("section_auto_advance", e.target.checked)}
                    className="accent-brand-600" />
                  Auto-advance on expiry
                </label>
              </div>
            </div>
            <SectionDurationEditor value={form.section_durations} onChange={(v) => set("section_durations", v)} />
            <p className="text-xs text-stone-400">Leave blank (∞) for no time limit on that section.</p>
            <SectionDescriptionEditor value={form.section_descriptions} onChange={(v) => set("section_descriptions", v)} />
            <p className="text-xs text-stone-400">Section descriptions are shown to students when they start each section.</p>
          </div>

          {/* Grading */}
          <div className="border border-stone-100 bg-stone-50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Grading</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-600 font-medium block mb-1">Pass Mark</label>
                <input type="number" min={0} step={0.5} value={form.pass_mark}
                  onChange={(e) => set("pass_mark", Number(e.target.value))}
                  placeholder="0"
                  className="w-full border border-stone-300 px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[10px] text-stone-400 mt-0.5 flex items-center gap-0.5">
                  <Info className="w-2.5 h-2.5" /> 0 = no pass mark. Shows PASS/FAIL in results.
                </p>
              </div>
            </div>
          </div>

          {/* Results publishing */}
          <div className="border border-stone-100 bg-stone-50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Results Publishing</p>
            <div>
              <label className="text-xs text-stone-600 font-medium block mb-1">Publish Results At</label>
              <input type="datetime-local" value={form.results_publish_time}
                onChange={(e) => set("results_publish_time", e.target.value)}
                className="w-full border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-stone-400 mt-1">Results page goes live at this time. Leave blank to never auto-publish.</p>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={form.notify_email} onChange={(e) => set("notify_email", e.target.checked)} className="accent-blue-600" />
                Email students (requires Resend or SMTP config)
              </label>
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={form.notify_sms} onChange={(e) => set("notify_sms", e.target.checked)} className="accent-blue-600" />
                SMS students (requires Twilio config)
              </label>
            </div>
          </div>

          {/* Behaviour */}
          <div className="border border-stone-100 bg-stone-50 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Question Behaviour</p>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={form.shuffle_questions}
                onChange={(e) => set("shuffle_questions", e.target.checked)}
                className="accent-blue-600" />
              Shuffle question order per student
            </label>
            <p className="text-[10px] text-stone-400">When disabled, questions appear in fixed order (section → question number).</p>
          </div>

          {/* Network */}
          <div className="border border-stone-100 bg-stone-50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Network / Security</p>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={form.ip_restriction} onChange={(e) => set("ip_restriction", e.target.checked)} className="accent-blue-600" />
              Require exam WiFi (IP restriction)
            </label>
            {form.ip_restriction && (
              <textarea value={form.allowed_ip_ranges} onChange={(e) => set("allowed_ip_ranges", e.target.value)}
                rows={3} placeholder={"192.168.10.0/24\n10.0.0.0/8"}
                className="w-full border border-stone-300 px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
            )}
            <label className="flex items-center gap-2 text-sm text-rose-700">
              <input type="checkbox" checked={form.test_mode} onChange={(e) => set("test_mode", e.target.checked)} className="accent-rose-600" />
              Test mode (bypasses time and IP checks)
            </label>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">{error}</div>
          )}

          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saving}
              className="px-6 h-10 bg-brand-700 text-white text-sm font-bold uppercase tracking-widest hover:bg-brand-800 transition-all shadow-md shadow-brand-900/10 disabled:opacity-60 flex items-center gap-2 rounded-lg">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Exam"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ExamsTab({ onExamSelect }: { onExamSelect?: (id: number) => void }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingExam, setEditingExam] = useState<Exam | null | "new">(null);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [published, setPublished] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setExams(await api.exams.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handlePublish = async (exam: Exam) => {
    setPublishing(exam.id);
    try {
      await api.exams.publish(exam.id);
      setPublished(exam.id);
      setTimeout(() => setPublished(null), 3000);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPublishing(null);
    }
  };

  const handleDelete = async (exam: Exam) => {
    if (!confirm(`Delete exam "${exam.name}"? This will also delete all student data for this exam.`)) return;
    setDeleting(exam.id);
    try {
      await api.exams.delete(exam.id);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  };

  if (editingExam !== null) {
    return (
      <ExamFormPage
        exam={editingExam === "new" ? null : editingExam}
        onSave={() => { setEditingExam(null); load(); }}
        onClose={() => setEditingExam(null)}
      />
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Exams</h1>
          <p className="text-stone-400 text-xs mt-0.5">Create and manage multiple independent exams</p>
        </div>
        <button
          onClick={() => setEditingExam("new")}
          className="flex items-center gap-2 bg-brand-700 text-white px-5 h-10 text-xs font-bold uppercase tracking-widest hover:bg-brand-800 transition-all shadow-md shadow-brand-900/10 rounded-lg"
        >
          <Plus className="w-4 h-4" /> New Exam
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-stone-300" />
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white border border-stone-200 py-20 text-center">
          <p className="text-stone-400">No exams yet. Create your first exam.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <div key={exam.id} className="bg-white border border-stone-200 shadow-sm p-5 rounded-lg hover:shadow-md transition-all group">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-stone-900 tracking-tight">{exam.name}</h2>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 border-2 rounded-lg ${STATUS_STYLES[exam.status] ?? ""}`}>
                      {exam.status}
                    </span>
                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest bg-stone-100 px-2 py-1 rounded-md">
                      {exam.code}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-500">
                    {exam.exam_start_time && (
                      <span>Start: {new Date(exam.exam_start_time).toLocaleString()}</span>
                    )}
                    <span>{exam.exam_duration_minutes} min</span>
                    {(exam.grace_minutes ?? 0) > 0 && (
                      <span className="text-amber-600">Grace: {exam.grace_minutes} min</span>
                    )}
                    {(exam.pass_mark ?? 0) > 0 && (
                      <span className="text-brand-600">Pass: {exam.pass_mark}</span>
                    )}
                    {exam.student_count != null && (
                      <span>{exam.student_count} students · {exam.active_count} active · {exam.submitted_count} submitted</span>
                    )}
                    {exam.results_publish_time && (
                      <span className="text-teal-600">Results: {new Date(exam.results_publish_time).toLocaleString()}</span>
                    )}
                    {exam.test_mode && <span className="text-rose-600 font-semibold">TEST MODE</span>}
                  </div>

                  {Object.keys(exam.section_durations ?? {}).length > 0 && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {Object.entries(exam.section_durations).map(([s, m]) => (
                        <span key={s} className="text-[10px] font-bold uppercase tracking-widest bg-brand-50 border border-brand-100 text-brand-700 px-2.5 py-1 rounded-md">
                          Section {s}: {m}m
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                  {onExamSelect && (
                    <button
                      onClick={() => onExamSelect(exam.id)}
                      className="text-[10px] font-bold uppercase tracking-widest text-brand-700 border-2 border-brand-200 px-4 py-2 hover:bg-brand-50 transition-all rounded-lg"
                    >
                      Open Hall
                    </button>
                  )}
                  {exam.results_publish_time && (
                    <a
                      href="/results"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-50 border-2 border-stone-200 px-4 py-2 hover:bg-stone-50 transition-all rounded-lg"
                    >
                      <ExternalLink className="w-3 h-3" /> Results
                    </a>
                  )}
                  <button
                    onClick={() => handlePublish(exam)}
                    disabled={publishing === exam.id}
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-700 border-2 border-teal-200 px-4 py-2 hover:bg-teal-50 transition-all rounded-lg disabled:opacity-50"
                  >
                    {publishing === exam.id ? <Loader2 className="w-3 h-3 animate-spin" /> :
                      published === exam.id ? <CheckCircle2 className="w-3 h-3" /> :
                        <Send className="w-3 h-3" />}
                    {published === exam.id ? "Done" : "Publish"}
                  </button>
                  <button
                    onClick={() => setEditingExam(exam)}
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-600 border-2 border-stone-200 px-4 py-2 hover:bg-stone-50 transition-all rounded-lg"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(exam)}
                    disabled={deleting === exam.id || exam.code === "DEFAULT"}
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-rose-600 border-2 border-rose-200 px-4 py-2 hover:bg-rose-50 transition-all rounded-lg disabled:opacity-30"
                  >
                    {deleting === exam.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
