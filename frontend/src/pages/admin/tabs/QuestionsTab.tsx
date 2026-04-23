import { useState, useEffect, useRef } from "react";
import { api } from "../../../api/client";
import type { QuestionRow, QuestionType, StreamDef } from "../../../types";
import {
  Loader2,
  Plus,
  UploadCloud,
  FileText,
  Trash2,
  Wand2,
  Download,
  Table as TableIcon,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const TYPES: QuestionType[] = [
  "mcq",
  "true_false",
  "fill_blank",
  "descriptive",
];
const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "MCQ",
  true_false: "True / False",
  fill_blank: "Fill Blank",
  descriptive: "Descriptive",
};

// ── Component: Manual Question Form ──────────────────────────────────────────
function QuestionForm({
  initial,
  onSave,
  onCancel,
  streams = [],
  sets = [],
}: {
  initial?: Partial<QuestionRow>;
  onSave: (q: Partial<QuestionRow> & { paper_set: string }) => Promise<void>;
  onCancel: () => void;
  streams?: StreamDef[];
  sets?: StreamDef[];
}) {
  const [form, setForm] = useState<
    Partial<QuestionRow> & { paper_set: string }
  >(() => {
    let optsEn = initial?.options_en || ["", "", "", ""];
    let optsAr = initial?.options_ar || ["", "", "", ""];

    // Safely parse if they arrived as strings
    if (typeof optsEn === "string") {
      try { optsEn = JSON.parse(optsEn); } catch { optsEn = ["", "", "", ""]; }
    }
    if (typeof optsAr === "string") {
      try { optsAr = JSON.parse(optsAr); } catch { optsAr = ["", "", "", ""]; }
    }

    return {
      paper_set: initial?.paper_set || (sets?.[0]?.name || "A"),
      section: 1,
      type: "mcq",
      language: "both",
      question_en: "",
      question_ar: "",
      correct_answer: "",
      marks: 1,
      stream: undefined,
      ...initial,
      // Ensure these overwrite whatever `...initial` spread
      options_en: optsEn,
      options_ar: optsAr,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const isSection5 = form.section === 5;
  const setOption = (lang: "en" | "ar", i: number, val: string) => {
    const key = lang === "en" ? "options_en" : "options_ar";
    const opts = [...((form[key] as string[]) || [])];
    opts[i] = val;
    set(key, opts);
  };

  const handleSave = async () => {
    if (form.section === 5 && !form.stream) {
      setError("Section 5 requires a stream selection");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, stream: form.section === 5 ? form.stream : null });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const inputBase =
    "w-full border border-stone-300 shadow-sm px-3 py-2 text-sm text-stone-900 bg-white placeholder-stone-400 focus:ring-2 focus:ring-brand-500 rounded-lg focus:border-brand-500 focus:outline-none transition-shadow";
  const labelBase = "text-sm font-medium text-stone-700 mb-1.5 block";

  return (
    <div className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto font-sans">
      <div className="bg-white border border-stone-200 shadow-2xl w-full max-w-3xl mt-12 mb-12 rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900">
            {initial?.id ? "Edit Question" : "New Question"}
          </h2>
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className={labelBase}>Paper Set</label>
              <select
                value={form.paper_set}
                onChange={(e) => set("paper_set", e.target.value)}
                className={inputBase}
              >
                {sets?.map(s => (
                  <option key={s.id} value={s.name}>Set {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelBase}>Section</label>
              <select
                value={form.section}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setForm((f) => ({ ...f, section: s, stream: s === 5 ? f.stream : null }));
                }}
                className={inputBase}
              >
                {[1, 2, 3, 4].map((s) => (
                  <option key={s} value={s}>
                    Section {s} — All Streams
                  </option>
                ))}
                <option value={5}>Section 5 — Stream Specific</option>
              </select>
            </div>
            <div>
              <label className={labelBase}>Type</label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                className={inputBase}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelBase}>Language</label>
              <select
                value={form.language}
                onChange={(e) => set("language", e.target.value)}
                className={inputBase}
              >
                <option value="both">Both</option>
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
          </div>

          {isSection5 && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <label className="text-sm font-medium text-amber-800 mb-1.5 block">
                Stream <span className="text-rose-500">*</span>
                <span className="ml-2 text-xs font-normal text-amber-600">Section 5 is stream-specific — select which stream this question belongs to</span>
              </label>
              <select
                value={form.stream ?? ""}
                onChange={(e) => set("stream", e.target.value || null)}
                className={inputBase}
              >
                <option value="">— Select stream —</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className={labelBase}>Question (English)</label>
              <textarea
                value={form.question_en || ""}
                onChange={(e) => set("question_en", e.target.value)}
                rows={3}
                className={`${inputBase} resize-none`}
              />
            </div>
            <div>
              <label className={labelBase}>Question (Arabic)</label>
              <textarea
                value={form.question_ar || ""}
                onChange={(e) => set("question_ar", e.target.value)}
                rows={3}
                dir="rtl"
                className={`${inputBase} resize-none font-arabic`}
              />
            </div>
          </div>

          {form.type === "mcq" && (
            <div className="mb-6 bg-stone-50 border border-stone-100 p-4 rounded-lg">
              <p className="text-xs uppercase tracking-widest text-stone-600 font-semibold mb-4">
                Options Configuration
              </p>
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="grid md:grid-cols-2 gap-3">
                    <div className="flex gap-3 items-center">
                      <span className="text-stone-500 font-medium text-sm w-4">
                        {["A", "B", "C", "D"][i]}
                      </span>
                      <input
                        value={(form.options_en as string[])?.[i] || ""}
                        onChange={(e) => setOption("en", i, e.target.value)}
                        placeholder="English Option"
                        className={inputBase}
                      />
                    </div>
                    <input
                      value={(form.options_ar as string[])?.[i] || ""}
                      onChange={(e) => setOption("ar", i, e.target.value)}
                      placeholder="الخيار العربي"
                      dir="rtl"
                      className={`${inputBase} font-arabic`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelBase}>Correct Answer</label>
              {form.type === "mcq" ? (
                <select
                  value={form.correct_answer || ""}
                  onChange={(e) => set("correct_answer", e.target.value)}
                  className={inputBase}
                >
                  <option value="">— Select Correct Option —</option>
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              ) : form.type === "true_false" ? (
                <select
                  value={form.correct_answer || ""}
                  onChange={(e) => set("correct_answer", e.target.value)}
                  className={inputBase}
                >
                  <option value="">— Select Truth Value —</option>
                  <option value="true">True / صح</option>
                  <option value="false">False / خطأ</option>
                </select>
              ) : (
                <input
                  value={form.correct_answer || ""}
                  onChange={(e) => set("correct_answer", e.target.value)}
                  placeholder={form.type === "fill_blank" ? "The exact text answer" : "Manual Grading"}
                  className={inputBase}
                />
              )}
            </div>
            <div>
              <label className={labelBase}>Marks</label>
              <input
                type="number"
                value={form.marks || 1}
                onChange={(e) => set("marks", Number(e.target.value))}
                step={0.5}
                className={inputBase}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="bg-white text-stone-700 px-5 py-2 border-2 border-stone-200 hover:bg-stone-50 transition-all rounded-lg text-[10px] font-bold uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-700 text-white px-7 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-800 shadow-md shadow-brand-900/10 transition-all disabled:opacity-50 rounded-lg"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Save Question"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component: AI OCR Import Modal ───────────────────────────────────────────
function AIImportModal({
  onCancel,
  onImportComplete,
  sets = [],
}: {
  onCancel: () => void;
  onImportComplete: () => void;
  sets?: StreamDef[];
}) {
  const [parsing, setParsing] = useState(false);
  const [data, setData] = useState<Partial<QuestionRow>[] | null>(null);
  const [error, setError] = useState("");
  const [paperSet, setPaperSet] = useState("A");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setParsing(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await api.questions.parseFromImage(fd);
      setData(res.questions);
    } catch (err: any) {
      setError(err.message || "OCR Parsing failed");
    } finally {
      setParsing(false);
    }
  };

  const handleSaveBulk = async () => {
    if (!data) return;
    try {
      await api.questions.createBulk(
        data.map((q) => ({ ...q, paper_set: paperSet })),
      );
      onImportComplete();
    } catch {
      setError("Failed to save imported questions.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 shadow-2xl w-full max-w-4xl mt-12 mb-12">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-brand-700" /> AI Question Parser
          </h2>
          {data && (
            <select
              value={paperSet}
              onChange={(e) => setPaperSet(e.target.value)}
              className="border border-stone-300 text-sm px-3 py-1.5 focus:outline-none"
            >
              {sets.map(s => (
                <option key={s.id} value={s.name}>Set {s.name}</option>
              ))}
              {sets.length === 0 && (
                <>
                  <option value="A">Set A</option>
                  <option value="B">Set B</option>
                </>
              )}
            </select>
          )}
        </div>
        <div className="p-6">
          {!data && !parsing && (
            <label className="border-2 border-dashed border-stone-200 p-16 flex flex-col items-center justify-center cursor-pointer hover:bg-brand-50 hover:border-brand-300 transition-all rounded-lg group">
              <UploadCloud className="w-12 h-12 text-stone-300 mb-4 group-hover:text-brand-400 transition-colors" />
              <p className="font-semibold text-stone-900">Upload Exam Photo</p>
              <p className="text-stone-500 text-sm mt-1">
                Our Tesseract engine will isolate questions and Arabic text.
              </p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
            </label>
          )}
          {parsing && (
            <div className="py-20 text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-600 mb-4" />
              <p className="font-bold text-stone-900 uppercase tracking-widest text-[10px]">AI is reading the document...</p>
            </div>
          )}
          {data && (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {data.map((q, i) => (
                <div
                  key={i}
                  className="border border-stone-200 p-4 hover:border-brand-300 rounded-lg transition-colors"
                >
                  <p className="text-sm font-semibold mb-2">
                    {q.question_en || q.question_ar}
                  </p>
                  <p className="text-xs text-stone-500">
                    Correct Answer: {q.correct_answer || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
          {error && <p className="mt-4 text-rose-600 text-sm">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-stone-600">
            Cancel
          </button>
          <button
            disabled={!data}
            onClick={handleSaveBulk}
            className="bg-brand-700 text-white px-8 h-10 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-800 disabled:opacity-50 transition-all rounded-lg shadow-md shadow-brand-900/10"
          >
            Import Questions
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component: CSV Import Modal ──────────────────────────────────────────────
/** Parse a single CSV line respecting double-quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === "," && !inQ) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

type PaperOverride = "auto" | string;

async function parseFile(file: File): Promise<any[]> {
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  if (isCsv) {
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, "_"),
    );
    return lines.slice(1).map((line) => {
      const v = parseCSVLine(line);
      const row: any = {};
      headers.forEach((h, i) => { row[h] = v[i]; });
      return row;
    });
  }

  // XLSX parsing
  if (!(window as any)["XLSX"]) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const XLSX = (window as any)["XLSX"];
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function FileImportModal({
  onCancel,
  onImportComplete,
  sets,
}: {
  onCancel: () => void;
  onImportComplete: () => void;
  sets: StreamDef[];
}) {
  const [override, setOverride] = useState<PaperOverride>("auto");
  // rawRows: parsed straight from CSV, paper_set from file
  const [rawRows, setRawRows] = useState<Partial<QuestionRow>[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Derived preview: apply override on top of raw rows
  const preview: Partial<QuestionRow>[] = rawRows.map((q) => ({
    ...q,
    paper_set: override === "auto" ? q.paper_set : override,
  }));

  const downloadTemplate = () => {
    const rows = [
      "paper_set,section,type,language,question_en,question_ar,option_a_en,option_b_en,option_c_en,option_d_en,correct_answer,marks,stream",
      "A,1,mcq,en,Your question text here,,Option A,Option B,Option C,Option D,A,1,",
      "A,2,fill_blank,en,Complete: The capital of India is ______.,,,,,,New Delhi,1,",
      "A,3,true_false,en,The Earth revolves around the Sun.,,,,,,true,1,",
      "A,5,descriptive,en,Explain the causes of World War I.,,,,,,Manual Grading,5,humanities",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    a.download = "questions_template.csv";
    a.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setParseError("");
    setRawRows([]);
    setLoading(true);
    try {
      const rowsRaw = await parseFile(f);
      if (rowsRaw.length === 0) {
        setParseError("File has no data rows. Check the format.");
        return;
      }
      
      const rows: Partial<QuestionRow>[] = rowsRaw.map((v: any) => {
        const get = (key: string) => {
          const k = Object.keys(v).find(ck => ck.toLowerCase().replace(/\s+/g, "_") === key);
          return k ? v[k] : "";
        };

        const ps = String(get("paper_set") || "").toUpperCase();
        return {
          paper_set: ps || (sets[0]?.name || "A"),
          section: parseInt(get("section")) || 1,
          type: (get("type") || "mcq") as QuestionType,
          language: (get("language") || "en") as import("../../../types").Language,
          question_en: String(get("question_en") || ""),
          question_ar: String(get("question_ar") || ""),
          options_en: [
            String(get("option_a_en") || ""),
            String(get("option_b_en") || ""),
            String(get("option_c_en") || ""),
            String(get("option_d_en") || ""),
          ],
          options_ar: [
            String(get("option_a_ar") || ""),
            String(get("option_b_ar") || ""),
            String(get("option_c_ar") || ""),
            String(get("option_d_ar") || ""),
          ],
          correct_answer: String(get("correct_answer") || ""),
          marks: parseFloat(get("marks")) || 1,
          stream: get("stream") || undefined,
        };
      });
      setRawRows(rows);
    } catch (err) {
      console.error("Parse Error:", err);
      setParseError("Failed to parse file. Ensure it is a valid CSV or XLSX.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleUpload = async () => {
    console.log("Starting bulk upload with preview:", preview);
    setLoading(true);
    try {
      const result = await api.questions.createBulk(preview);
      console.log("Bulk upload result:", result);
      
      const errs = (result.errors || []) as { row: number; error: string }[];
      
      if (result.inserted === 0 && errs.length > 0) {
        alert(`Import failed: ${errs[0]?.error || "Unknown error"}`);
        return;
      }
      
      if (result.inserted === 0 && errs.length === 0) {
        alert("No questions were imported. Check if the file contains valid data.");
        return;
      }

      if (errs.length > 0) {
        alert(
          `Imported ${result.inserted} of ${preview.length} questions.\n${errs.length} row(s) had errors:\n` +
          errs
            .slice(0, 5)
            .map((e) => `Row ${e.row}: ${e.error}`)
            .join("\n"),
        );
      }
      onImportComplete();
    } catch (err) {
      console.error("Upload Error:", err);
      alert("Import request failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const sectionCounts = [1, 2, 3, 4, 5].map((s) => ({
    s,
    n: preview.filter((q) => q.section === s).length,
  }));

  return (
    <div className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 shadow-2xl w-full max-w-4xl mt-10 mb-10 rounded-lg overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
            <TableIcon className="w-5 h-5 text-stone-500" /> CSV Bulk Upload
          </h2>
          <button
            onClick={onCancel}
            className="text-stone-400 hover:text-stone-900 text-xl leading-none px-1"
          >
            &times;
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Step 1: Paper Set ─────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">
              Step 1 — Paper Set
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setOverride("auto")}
                className={`px-4 py-3 border-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg min-w-[120px] ${override === "auto"
                  ? "border-stone-600 bg-stone-100 text-stone-800"
                  : "border-stone-200 text-stone-500 hover:border-brand-400 hover:text-brand-700"
                  }`}
              >
                Auto (from file)
              </button>
              {sets.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setOverride(s.name)}
                  className={`px-4 py-3 border-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg min-w-[120px] ${override === s.name
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-stone-200 text-stone-500 hover:border-brand-400 hover:text-brand-700"
                    }`}
                >
                  Set {s.name}
                </button>
              ))}
            </div>
            {override === "auto" && (
              <p className="text-xs text-stone-400 mt-2">
                Each row's <span className="font-mono">paper_set</span> column value will be used as-is.
              </p>
            )}
            {override !== "auto" && (
              <p className="text-xs text-stone-400 mt-2">
                All imported questions will be assigned to <span className="font-semibold">Set {override}</span>, ignoring the CSV column.
              </p>
            )}
          </div>

          {/* ── Step 2: File Upload ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                Step 2 — Upload CSV
              </p>
              <button
                onClick={downloadTemplate}
                className="text-[10px] text-brand-700 font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Download Template
              </button>
            </div>

            <label
              className={`flex flex-col items-center justify-center border-2 border-dashed cursor-pointer transition-colors p-8 rounded-lg ${rawRows.length > 0
                ? "border-teal-400 bg-teal-50"
                : "border-stone-300 hover:border-brand-400 hover:bg-brand-50"
                }`}
            >
              {rawRows.length > 0 ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-teal-500 mb-2" />
                  <p className="font-semibold text-teal-800 text-sm">{fileName}</p>
                  <p className="text-teal-600 text-xs mt-1">
                    {rawRows.length} rows parsed — click to replace
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="w-10 h-10 text-stone-300 mb-3" />
                  <p className="font-semibold text-stone-700 text-sm">
                    Click to browse or drag CSV here
                  </p>
                  <p className="text-stone-400 text-xs mt-1">
                    Supports the standard template format (with or without id column)
                  </p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
            </label>

            {parseError && (
              <div className="mt-2 text-sm text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {parseError}
              </div>
            )}
          </div>

          {/* ── Step 3: Preview ──────────────────────────────────────────── */}
          {preview.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                  Step 3 — Preview
                </p>
                <div className="flex gap-2">
                  {sectionCounts.filter((c) => c.n > 0).map(({ s, n }) => (
                    <span
                      key={s}
                      className="text-xs bg-stone-100 border border-stone-200 text-stone-600 font-semibold px-2 py-0.5"
                    >
                      Section {s}: {n}
                    </span>
                  ))}
                </div>
              </div>
              <div className="border border-stone-200 overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 sticky top-0 border-b border-stone-200">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-stone-500 uppercase tracking-wider w-12">Set</th>
                        <th className="px-3 py-2 font-semibold text-stone-500 uppercase tracking-wider w-10">Sec</th>
                        <th className="px-3 py-2 font-semibold text-stone-500 uppercase tracking-wider w-20">Type</th>
                        <th className="px-3 py-2 font-semibold text-stone-500 uppercase tracking-wider">Question</th>
                        <th className="px-3 py-2 font-semibold text-stone-500 uppercase tracking-wider w-16">Answer</th>
                        <th className="px-3 py-2 font-semibold text-stone-500 uppercase tracking-wider w-14">Marks</th>
                        <th className="px-3 py-2 font-semibold text-stone-500 uppercase tracking-wider w-20">Stream</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {preview.map((q, i) => (
                        <tr key={i} className="hover:bg-stone-50">
                          <td className="px-3 py-2">
                            <span
                              className={`font-bold px-1.5 py-0.5 text-[10px] bg-stone-100 text-stone-700`}
                            >
                              {q.paper_set}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-stone-600">{q.section}</td>
                          <td className="px-3 py-2">
                            <span className="uppercase font-semibold text-stone-500 tracking-wider text-[10px]">
                              {q.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-stone-800 max-w-xs">
                            <span className="line-clamp-1 block">
                              {q.question_en || q.question_ar || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-bold text-brand-700 font-mono">
                            {q.correct_answer || "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-stone-600">{q.marks}</td>
                          <td className="px-3 py-2 text-stone-500 capitalize">
                            {q.stream || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
          <p className="text-xs text-stone-400">
            {preview.length > 0
              ? `${preview.length} question${preview.length !== 1 ? "s" : ""} ready to import`
              : "No file loaded yet"}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-stone-600 text-sm hover:text-stone-900"
            >
              Cancel
            </button>
            <button
              disabled={preview.length === 0 || loading}
              onClick={handleUpload}
              className="bg-brand-700 text-white px-7 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-800 shadow-md shadow-brand-900/10 transition-all disabled:opacity-40 flex items-center gap-2 rounded-lg"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Import {preview.length > 0 ? `${preview.length} Questions` : ""}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT: Questions Tab ────────────────────────────────────────────
export default function QuestionsTab() {
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paperFilter, setPaperFilter] = useState("A");
  const [sectionFilter, setSectionFilter] = useState<number | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [streams, setStreams] = useState<StreamDef[]>([]);
  const [sets, setSets] = useState<StreamDef[]>([]);

  const [modal, setModal] = useState<"none" | "manual" | "csv">("none");
  const [editing, setEditing] = useState<Partial<QuestionRow> | null>(null);
  const [streamFilter, setStreamFilter] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const qs = await api.questions.list({
        paper_set: paperFilter,
        stream: streamFilter || undefined,
      });
      setQuestions(qs);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDependencies = async () => {
    try {
      const [sData, setData] = await Promise.all([
        api.admin.getStreams(),
        api.admin.getSets(),
      ]);
      setStreams(sData);
      setSets(setData);
      if (setData.length > 0 && !paperFilter) {
        setPaperFilter(setData[0].name);
      }
    } catch { }
  };

  useEffect(() => {
    load();
  }, [paperFilter, streamFilter]);

  useEffect(() => {
    loadDependencies();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this question?")) return;
    await api.questions.delete(id);
    load();
  };

  const filtered = questions.filter((q) => {
    const matchesSearch =
      (q.question_en || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.question_ar || "").includes(searchQuery);
    const matchesSection = sectionFilter === "" || q.section === sectionFilter;
    return matchesSearch && matchesSection;
  });

  return (
    <div className="w-full font-sans bg-stone-50 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Question Bank
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            {questions.length} questions mapped in current view.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal("csv")}
            className="bg-white text-stone-700 border-2 border-stone-200 px-5 h-10 text-[10px] font-bold uppercase tracking-widest hover:bg-stone-50 transition-all rounded-lg flex items-center gap-2"
          >
            <TableIcon className="w-4 h-4" /> Bulk CSV
          </button>
          {/* AI Import — temporarily disabled
          <button
            onClick={() => setModal("ai")}
            className="bg-white text-stone-700 border border-stone-300 px-4 h-9 text-sm font-medium hover:bg-stone-100 flex items-center gap-2"
          >
            <Wand2 className="w-4 h-4 text-blue-600" /> AI Import
          </button>
          */}
          <button
            onClick={() => setModal("manual")}
            className="bg-brand-700 text-white px-5 h-10 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-800 transition-all shadow-md shadow-brand-900/10 flex items-center gap-2 rounded-lg"
          >
            <Plus className="w-4 h-4" /> New Question
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => setSectionFilter(sectionFilter === s ? "" : s)}
            className={`p-5 border shadow-sm transition-all text-left rounded-lg ${sectionFilter === s ? "bg-brand-700 border-brand-800 text-white scale-[1.02]" : "bg-white border-stone-200 hover:border-brand-400 text-stone-900"}`}
          >
            <p
              className={`text-[10px] uppercase tracking-widest font-black mb-1 ${sectionFilter === s ? "text-brand-100" : "text-stone-400"}`}
            >
              Section {s}
            </p>
            <p className="text-3xl font-black tabular-nums tracking-tight">
              {questions.filter((q) => q.section === s).length}
            </p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-stone-100 bg-stone-50 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg"
            />
          </div>
          <select
            value={paperFilter}
            onChange={(e) => setPaperFilter(e.target.value)}
            className="border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white min-w-[120px] rounded-lg"
          >
            {sets.map(s => (
              <option key={s.id} value={s.name}>Set {s.name}</option>
            ))}
          </select>

          <select
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            className="border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white min-w-[160px] rounded-lg"
          >
            <option value="">Any Stream</option>
            <option value="all">General (Common)</option>
            {streams.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name.charAt(0).toUpperCase() + s.name.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            className="border-2 border-stone-200 px-3 py-2 hover:bg-stone-50 text-stone-400 hover:text-brand-600 transition-all rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-stone-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-stone-400 text-sm">
            No questions match your current filters.
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filtered.map((q) => (
              <div
                key={q.id}
                className="p-5 flex gap-6 hover:bg-brand-50/40 group transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-stone-900 text-white text-[10px] font-black px-3 py-1 tracking-widest uppercase">
                      Section {q.section}
                    </span>
                    {q.section <= 4 ? (
                      <span className="bg-amber-100 border border-amber-200 text-amber-700 text-[10px] font-bold px-2 py-0.5 tracking-widest uppercase">
                        General
                      </span>
                    ) : (
                      <span className="bg-brand-100 border border-brand-200 text-brand-700 text-[10px] font-bold px-2 py-0.5 tracking-widest uppercase">
                        {q.stream || "Unassigned"}
                      </span>
                    )}
                    <span className="bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 tracking-widest uppercase">
                      {TYPE_LABELS[q.type]}
                    </span>
                    <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest ml-auto">
                      ID:{q.id}
                    </span>
                  </div>
                  <p className="text-stone-900 font-medium text-sm leading-relaxed">
                    {q.question_en || q.question_ar}
                  </p>
                  {q.correct_answer && (
                    <p className="text-teal-700 text-xs mt-2 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Answer:{" "}
                      {q.correct_answer}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditing(q);
                      setModal("manual");
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-brand-600 hover:text-brand-800 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="text-xs font-bold uppercase tracking-widest text-stone-400 hover:text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal === "manual" && (
        <QuestionForm
          key={editing?.id ?? "new"}
          initial={editing || {}}
          streams={streams}
          sets={sets}
          onSave={async (d) => {
            if (editing?.id) await api.questions.update(editing.id, d);
            else await api.questions.create(d);
            setModal("none");
            setEditing(null);
            load();
          }}
          onCancel={() => {
            setModal("none");
            setEditing(null);
          }}
        />
      )}
      {/* AI Import — temporarily disabled
      {modal === "ai" && (
        <AIImportModal
          onCancel={() => setModal("none")}
          onImportComplete={() => {
            setModal("none");
            load();
          }}
        />
      )}
      */}
      {modal === "csv" && (
        <FileImportModal
          onCancel={() => setModal("none")}
          sets={sets}
          onImportComplete={() => {
            setModal("none");
            load();
          }}
        />
      )}
    </div>
  );
}