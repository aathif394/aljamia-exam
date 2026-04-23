import { useState } from "react";
import { api } from "../../../api/client";
import type { Exam } from "../../../types";
import { Loader2, Info } from "lucide-react";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function SectionDurationEditor({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-3">
      {[1, 2, 3, 4, 5].map((s) => (
        <div key={s}>
          <label className="text-[10px] text-stone-500 font-bold uppercase tracking-widest block mb-1.5">
            §{s} (min)
          </label>
          <input
            type="number"
            min={0}
            value={value[String(s)] ?? ""}
            onChange={(e) => {
              const num =
                e.target.value === "" ? undefined : parseInt(e.target.value, 10);
              const next = { ...value };
              if (num == null || isNaN(num) || num === 0) {
                delete next[String(s)];
              } else {
                next[String(s)] = num;
              }
              onChange(next);
            }}
            placeholder="∞"
            className="w-full border border-stone-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg"
          />
        </div>
      ))}
    </div>
  );
}

export default function ConfigTab({
  exam,
  onSaved,
}: {
  exam: Exam;
  onSaved: (e: Exam) => void;
}) {
  const [form, setForm] = useState({
    name: exam.name,
    name_ar: exam.name_ar ?? "",
    exam_start_time: toLocalInput(exam.exam_start_time),
    exam_duration_minutes: exam.exam_duration_minutes,
    grace_minutes: exam.grace_minutes ?? 0,
    pass_mark: exam.pass_mark ?? 0,
    ip_restriction: exam.ip_restriction,
    allowed_ip_ranges: (exam.allowed_ip_ranges ?? []).join("\n"),
    test_mode: exam.test_mode,
    section_durations: { ...(exam.section_durations ?? {}) },
    section_auto_advance: exam.section_auto_advance ?? false,
    results_publish_time: toLocalInput(exam.results_publish_time),
    notify_email: exam.notify_email ?? false,
    notify_sms: exam.notify_sms ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const ranges = form.allowed_ip_ranges
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean);

      const payload: Partial<Exam> = {
        name: form.name,
        name_ar: form.name_ar || undefined,
        exam_duration_minutes: form.exam_duration_minutes,
        grace_minutes: form.grace_minutes,
        pass_mark: form.pass_mark,
        ip_restriction: form.ip_restriction,
        allowed_ip_ranges: ranges,
        test_mode: form.test_mode,
        section_durations: form.section_durations,
        section_auto_advance: form.section_auto_advance,
        notify_email: form.notify_email,
        notify_sms: form.notify_sms,
        exam_start_time: form.exam_start_time
          ? new Date(form.exam_start_time).toISOString()
          : null,
        results_publish_time: form.results_publish_time
          ? new Date(form.results_publish_time).toISOString()
          : null,
      };

      await api.exams.update(exam.id, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      const updated = await api.exams.get(exam.id);
      onSaved(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900 mb-1">
        Exam Configuration
      </h1>
      <p className="text-stone-500 text-sm mb-8">
        <span className="font-mono text-stone-700 font-bold">{exam.code}</span> · {exam.name}
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identity */}
        <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
          <h2 className="text-base font-bold text-stone-900 mb-4 uppercase tracking-tight">Identity</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                Exam Name (English)
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                Exam Name (Arabic)
              </label>
              <input
                type="text"
                value={form.name_ar}
                onChange={(e) => set("name_ar", e.target.value)}
                dir="rtl"
                className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Timing */}
        <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
          <h2 className="text-base font-bold text-stone-900 mb-4 uppercase tracking-tight">Timing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                Exam Start Time (local time)
              </label>
              <input
                type="datetime-local"
                value={form.exam_start_time}
                onChange={(e) => set("exam_start_time", e.target.value)}
                className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
              />
              {form.exam_start_time && (
                <p className="text-stone-400 text-[10px] mt-1 font-mono">
                  UTC: {new Date(form.exam_start_time).toUTCString()}
                </p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                Total Duration (minutes)
              </label>
              <input
                type="number"
                value={form.exam_duration_minutes}
                onChange={(e) => set("exam_duration_minutes", Number(e.target.value))}
                min={1}
                step={1}
                className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
              />
            </div>
          </div>

          {/* Grace period */}
          <div className="border-t border-stone-100 pt-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                  Grace Period (minutes after start)
                </label>
                <input
                  type="number"
                  value={form.grace_minutes}
                  onChange={(e) => set("grace_minutes", Number(e.target.value))}
                  min={0}
                  step={1}
                  placeholder="0"
                  className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
                />
                <p className="text-[10px] text-stone-400 mt-1.5 flex items-center gap-1 font-medium italic">
                  <Info className="w-3 h-3" />
                  0 = no limit. Students can log in up to this many minutes after start.
                </p>
              </div>
            </div>
          </div>

          {/* Section durations */}
          <div className="border-t border-stone-100 pt-4">
            <div className="flex items-center justify-between mb-4">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                Per-Section Time Limits
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="section_auto_advance"
                  checked={form.section_auto_advance}
                  onChange={(e) => set("section_auto_advance", e.target.checked)}
                  className="w-4 h-4 accent-brand-700"
                />
                <label
                  htmlFor="section_auto_advance"
                  className="text-[10px] font-bold text-stone-700 uppercase tracking-widest"
                >
                  Auto-advance
                </label>
              </div>
            </div>
            <SectionDurationEditor
              value={form.section_durations}
              onChange={(v) => set("section_durations", v)}
            />
            <p className="text-[10px] text-stone-400 mt-3 flex items-center gap-1 italic">
              <Info className="w-3 h-3" />
              Leave blank (∞) for unlimited time on that section.
            </p>
          </div>
        </div>

        {/* Grading */}
        <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
          <h2 className="text-base font-bold text-stone-900 mb-4 uppercase tracking-tight">Grading</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
                Pass Mark
              </label>
              <input
                type="number"
                value={form.pass_mark}
                onChange={(e) => set("pass_mark", Number(e.target.value))}
                min={0}
                step={0.5}
                placeholder="0"
                className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
              />
              <p className="text-[10px] text-stone-400 mt-1.5 flex items-center gap-1 italic">
                <Info className="w-3 h-3" />
                0 = no pass mark. Badge shown in Results tab.
              </p>
            </div>
          </div>
        </div>

        {/* Results Publishing */}
        <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
          <h2 className="text-base font-bold text-stone-900 mb-4 uppercase tracking-tight">
            Results Publishing
          </h2>
          <div className="mb-4">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">
              Auto-Publish Results At
            </label>
            <input
              type="datetime-local"
              value={form.results_publish_time}
              onChange={(e) => set("results_publish_time", e.target.value)}
              className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
            />
            {form.results_publish_time && (
              <p className="text-stone-400 text-[10px] mt-1 font-mono">
                UTC: {new Date(form.results_publish_time).toUTCString()}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify_email"
                checked={form.notify_email}
                onChange={(e) => set("notify_email", e.target.checked)}
                className="w-4 h-4 accent-brand-700"
              />
              <label htmlFor="notify_email" className="text-[10px] font-bold text-stone-700 uppercase tracking-widest">
                Email notification
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify_sms"
                checked={form.notify_sms}
                onChange={(e) => set("notify_sms", e.target.checked)}
                className="w-4 h-4 accent-brand-700"
              />
              <label htmlFor="notify_sms" className="text-[10px] font-bold text-stone-700 uppercase tracking-widest">
                SMS notification
              </label>
            </div>
          </div>
        </div>

        {/* Network */}
        <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
          <h2 className="text-base font-bold text-stone-900 mb-4 uppercase tracking-tight">
            Network Restriction
          </h2>
          <div className="flex items-center gap-3 mb-6">
            <input
              type="checkbox"
              id="ip_restriction"
              checked={form.ip_restriction}
              onChange={(e) => set("ip_restriction", e.target.checked)}
              className="w-4 h-4 accent-brand-700"
            />
            <label htmlFor="ip_restriction" className="text-stone-900 text-[10px] font-bold uppercase tracking-widest">
              Restrict to exam WiFi
            </label>
          </div>
          {form.ip_restriction && (
            <div className="mb-4">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1.5">
                Allowed IP Ranges (CIDR, one per line)
              </label>
              <textarea
  value={form.allowed_ip_ranges}
  onChange={(e) => set("allowed_ip_ranges", e.target.value)}
  rows={4}
  placeholder={`192.168.10.0/24\n10.0.0.0/8\n127.0.0.1/32`}
  className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm font-mono resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
/>
            </div>
          )}
          <div className="bg-stone-50 border border-stone-100 p-5 rounded-lg">
            <p className="text-stone-700 text-[10px] font-bold mb-3 uppercase tracking-widest">
              WiFi Security Details
            </p>
            <ul className="text-stone-500 text-xs space-y-2">
              <li className="flex gap-2"><span>•</span> <span>Assign IPs in the range specified above.</span></li>
              <li className="flex gap-2"><span>•</span> <span>Block all internet access except to this server.</span></li>
              <li className="flex gap-2"><span>•</span> <span>Students on mobile data will be automatically blocked.</span></li>
            </ul>
          </div>
        </div>

        {/* Test mode */}
        <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
          <h2 className="text-base font-bold text-stone-900 mb-4 uppercase tracking-tight">
            Development
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="test_mode"
              checked={form.test_mode}
              onChange={(e) => set("test_mode", e.target.checked)}
              className="w-4 h-4 accent-rose-600"
            />
            <label htmlFor="test_mode" className="text-rose-700 font-bold text-[10px] uppercase tracking-widest">
              Test mode — bypass Security
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 px-5 py-4 text-sm text-rose-900 rounded-lg font-medium">
            {error}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-brand-700 text-white font-bold text-[10px] uppercase tracking-widest px-8 h-12 shadow-md shadow-brand-900/10 hover:bg-brand-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2 rounded-lg"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              "✓ Configuration Saved"
            ) : (
              "Save Configuration"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
