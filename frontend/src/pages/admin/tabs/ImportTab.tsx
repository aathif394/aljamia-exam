import { useState, useRef, useEffect } from "react";
import { api } from "../../../api/client";
import type { Centre } from "../../../types";
import { UploadCloud, Loader2, UserPlus, X } from "lucide-react";

type RawRow = Record<string, unknown>;

interface ColumnMapping {
  name_en: string;
  name_ar: string;
  dob: string;
  phone: string;
  stream: string;
  course: string;
  centre_col: string;
  paper_set: string;
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  name_en: "Name (English)",
  name_ar: "Name (Arabic)",
  dob: "Date of Birth",
  phone: "Phone / Roll Number",
  stream: "Stream",
  course: "Course",
  centre_col: "Examination Centre",
  paper_set: "Paper Set",
};

const FIELD_REQUIRED: Record<keyof ColumnMapping, boolean> = {
  name_en: true,
  dob: true,
  phone: true,
  stream: false,
  course: false,
  centre_col: false,
  name_ar: false,
  paper_set: false,
};

const ALIASES: Record<keyof ColumnMapping, string[]> = {
  name_en: ["name_en", "name", "first_name", "student_name", "full_name"],
  name_ar: ["name_ar", "arabic_name", "name_arabic"],
  dob: ["dob", "date_of_birth", "date", "birth_date", "birthdate"],
  phone: ["phone", "mobile", "mobile_number", "phone_number", "contact"],
  stream: ["stream", "branch", "department"],
  course: ["course", "programme", "program", "degree", "course_name"],
  centre_col: [
    "centre_id",
    "centre",
    "center",
    "examination_center",
    "exam_center",
    "venue",
  ],
  paper_set: ["paper_set", "set", "set_code", "paper"],
};

function autoDetect(headers: string[]): Partial<ColumnMapping> {
  const result: Partial<ColumnMapping> = {};
  for (const [field, aliases] of Object.entries(ALIASES) as [
    keyof ColumnMapping,
    string[],
  ][]) {
    for (const alias of aliases) {
      const match = headers.find(
        (h) => h.toLowerCase().replace(/[\s\-]/g, "_") === alias,
      );
      if (match) {
        result[field] = match;
        break;
      }
    }
  }
  return result;
}

function parseDob(value: string, format: string): string {
  const raw = String(value).trim();
  const n = Number(raw);

  // 1. Handle Excel Serial Numbers (e.g., 38426 or 37092.229166...)
  // FIX: Removed '\.' from regex so it accepts decimals, and added Math.floor
  if (!isNaN(n) && n > 10000 && !/[\-\/]/.test(raw)) {
    // Drop the decimal (time of day) to get just the date
    const days = Math.floor(n);
    // 25569 is the correct offset for JS dates from Excel's epoch
    const d = new Date((days - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  // 2. Handle strings with separators (e.g., 15-03-2005 or 2005-03-15)
  const parts = raw.split(/[\-\/\.]/);
  if (parts.length === 3) {
    let yyyy = "", mm = "", dd = "";

    // Auto-detect ISO format (YYYY-MM-DD) if the first part is 4 digits
    if (parts[0].length === 4) {
      yyyy = parts[0];
      mm = parts[1];
      dd = parts[2];
    } else {
      // Fallback to the UI dropdown format
      if (format === "DD-MM-YYYY") {
        dd = parts[0]; mm = parts[1]; yyyy = parts[2];
      } else if (format === "MM-DD-YYYY") {
        mm = parts[0]; dd = parts[1]; yyyy = parts[2];
      } else if (format === "YYYY-MM-DD") {
        yyyy = parts[0]; mm = parts[1]; dd = parts[2];
      }
    }

    if (yyyy && mm && dd) {
      // Handle 2-digit years from Excel (e.g., "05" -> "2005")
      if (yyyy.length === 2) {
        yyyy = (Number(yyyy) > 50 ? "19" : "20") + yyyy;
      }

      // Return strict unambiguous YYYY-MM-DD with hyphens preserved
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }

  // 3. Fallback (send as-is and let backend handle it)
  return raw;
}

function applyMapping(
  rawRows: RawRow[],
  mapping: ColumnMapping,
  dobFormat: string,
  defaultStream: string,
  defaultCentre: string,
  centres: Centre[],
): Record<string, unknown>[] {
  return rawRows.map((r) => {
    const get = (col: string) => (col ? String(r[col] ?? "") : "");

    // Centre Resolution
    let centre_id: string | number = defaultCentre;
    let resolved_centre_name = "Default/Unknown";

    if (mapping.centre_col) {
      const val = get(mapping.centre_col).toLowerCase().trim();
      const match = centres.find(
        (c) =>
          c.name_en.toLowerCase() === val ||
          c.name_en.toLowerCase().includes(val) ||
          val.includes(c.name_en.toLowerCase()),
      );
      if (match) {
        centre_id = match.id;
        resolved_centre_name = match.name_en;
      } else {
        const defMatch = centres.find(
          (c) => String(c.id) === String(defaultCentre),
        );
        if (defMatch) resolved_centre_name = defMatch.name_en;
      }
    } else {
      const defMatch = centres.find(
        (c) => String(c.id) === String(defaultCentre),
      );
      if (defMatch) resolved_centre_name = defMatch.name_en;
    }

    // Stream Resolution (Extract from course if missing)
    const courseVal = mapping.course ? get(mapping.course) : "UG";
    let streamRaw = mapping.stream
      ? get(mapping.stream).toLowerCase().trim()
      : "";

    // Aggressively extract from the exact dropdown strings
    if (!streamRaw && courseVal) {
      const cLower = courseVal.toLowerCase();
      if (cLower.includes("commerce")) {
        streamRaw = "commerce";
      } else if (cLower.includes("humanities")) {
        streamRaw = "humanities";
      } else if (cLower.includes("science")) {
        streamRaw = "science";
      }
    }

    // Strictly enforce ONLY the 3 allowed streams (plus 'general' fallback for Masters/UG)
    const validStreams = ["commerce", "humanities", "science"];
    const stream = validStreams.includes(streamRaw) ? streamRaw : "general";
    return {
      name_en: get(mapping.name_en),
      name_ar: get(mapping.name_ar),
      dob: mapping.dob ? parseDob(get(mapping.dob), dobFormat) : "",
      phone: get(mapping.phone),
      stream,
      course: courseVal,
      centre_id,
      resolved_centre_name,
      paper_set: mapping.paper_set ? get(mapping.paper_set).toUpperCase() : "",
    };
  });
}

async function parseFile(file: File): Promise<RawRow[]> {
  if (!(window as unknown as Record<string, unknown>)["XLSX"]) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const XLSX = (window as unknown as Record<string, unknown>)["XLSX"] as any;
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

interface ImportedStudent {
  roll_number: string;
  password: string;
  name_en: string;
  paper_set: string;
  stream: string;
}
type Step = "upload" | "map" | "preview" | "done";

const STREAMS = ["commerce", "science", "humanities"];

function CreateStudentModal({
  centres,
  sets,
  examId,
  onClose,
  onCreated,
}: {
  centres: Centre[];
  sets: import("../../../types").StreamDef[];
  examId?: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name_en: "", name_ar: "", dob: "", phone: "",
    stream: "general", course: "UG", email: "",
    centre_id: centres[0]?.id ? String(centres[0].id) : "",
    paper_set: sets[0]?.name || "A",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ roll_number: string; password: string } | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.admin.createStudent({
        name_en: form.name_en,
        dob: form.dob.trim(),
        phone: form.phone,
        stream: form.stream,
        course: form.course,
        name_ar: form.name_ar || undefined,
        email: form.email || undefined,
        centre_id: form.centre_id ? Number(form.centre_id) : undefined,
        paper_set: form.paper_set,
        exam_id: examId,
      });
      setCreated(res);
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-stone-200 shadow-2xl w-full max-w-md rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-semibold text-stone-900">Create Student</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
        </div>

        {created ? (
          <div className="p-5 space-y-4">
            <div className="bg-teal-50 border border-teal-200 p-4 space-y-2 rounded-lg">
              <p className="text-sm font-semibold text-teal-800">Student created successfully</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Roll Number</p>
                  <p className="font-mono font-bold text-stone-900 select-all">{created.roll_number}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Password</p>
                  <p className="font-mono font-bold text-stone-900 select-all">{created.password}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setCreated(null); setForm({ name_en: "", name_ar: "", dob: "", phone: "", stream: "general", course: "UG", email: "", centre_id: centres[0]?.id ? String(centres[0].id) : "", paper_set: "A" }); }}
                className="flex-1 border border-stone-300 text-stone-700 text-[10px] font-bold uppercase tracking-widest h-10 hover:bg-stone-50 transition-colors rounded-lg">
                Add Another
              </button>
              <button onClick={onClose} className="flex-1 bg-brand-700 text-white text-[10px] font-bold uppercase tracking-widest h-10 hover:bg-brand-800 transition-colors rounded-lg">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Name (English) *</label>
                <input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} required
                  className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Name (Arabic)</label>
                <input value={form.name_ar} onChange={(e) => set("name_ar", e.target.value)} dir="rtl"
                  className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">DOB (DDMMYYYY) *</label>
                <input value={form.dob} onChange={(e) => set("dob", e.target.value)} required placeholder="15032005"
                  className="w-full border border-stone-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Phone *</label>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} required type="tel"
                  className="w-full border border-stone-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Stream</label>
                <select value={form.stream} onChange={(e) => set("stream", e.target.value)}
                  className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {STREAMS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Course</label>
                <input value={form.course} onChange={(e) => set("course", e.target.value)}
                  className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Centre</label>
                <select value={form.centre_id} onChange={(e) => set("centre_id", e.target.value)}
                  className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— None —</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-1">Paper Set</label>
                <select value={form.paper_set} onChange={(e) => set("paper_set", e.target.value)}
                  className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {sets.map(s => (
                    <option key={s.id} value={s.name}>Set {s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-stone-300 text-stone-700 text-[10px] font-bold uppercase tracking-widest h-10 hover:bg-stone-50 transition-colors rounded-lg">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-brand-700 text-white text-[10px] font-bold uppercase tracking-widest h-10 hover:bg-brand-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 rounded-lg">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create Student
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ImportTab({
  centres,
  onImported,
  examId,
  examName,
}: {
  centres: Centre[];
  onImported: () => void;
  examId?: number;
  examName?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [sets, setSets] = useState<import("../../../types").StreamDef[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    name_en: "",
    name_ar: "",
    dob: "",
    phone: "",
    stream: "",
    course: "",
    centre_col: "",
    paper_set: "",
  });
  const [dobFormat, setDobFormat] = useState("DD-MM-YYYY");
  const [defaultStream, setDefaultStream] = useState("general");
  const [defaultCentre, setDefaultCentre] = useState(
    centres[0]?.id ? String(centres[0].id) : "",
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    errors: unknown[];
    students: ImportedStudent[];
  } | null>(null);
  const [parseError, setParseError] = useState("");

  useEffect(() => {
    api.admin.getSets().then(setSets).catch(() => {});
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    try {
      const rows = await parseFile(file);
      if (!rows.length) {
        setParseError("File is empty or could not be parsed.");
        return;
      }
      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setRawRows(rows);
      const detected = autoDetect(hdrs);
      setMapping((m) => ({ ...m, ...detected }));
      setStep("map");
    } catch {
      setParseError(
        "Could not parse file. Ensure it is a valid .csv or .xlsx.",
      );
    }
  };

  const setMap = (field: keyof ColumnMapping, value: string) =>
    setMapping((m) => ({ ...m, [field]: value }));
  const canProceed = mapping.name_en && mapping.dob && mapping.phone;
  const previewRows = applyMapping(
    rawRows.slice(0, 5),
    mapping,
    dobFormat,
    defaultStream,
    defaultCentre,
    centres,
  );

  const handleImport = async () => {
    setLoading(true);
    setParseError("");
    try {
      const mapped = applyMapping(
        rawRows,
        mapping,
        dobFormat,
        defaultStream,
        defaultCentre,
        centres,
      );

      // Clean 'resolved_centre_name' out before sending to API
      const payload = mapped.map(({ resolved_centre_name, ...rest }) => rest);

      const res = await api.admin.importStudents(payload, "", examId);
      setResult(res as any);
      setStep("done");
      onImported();
    } catch (e) {
      setParseError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const downloadCredentials = () => {
    if (!result?.students) return;
    const lines = [
      "Roll Number,Name,Stream,Paper Set,Password",
      ...result.students.map(
        (s) =>
          `${s.roll_number},"${s.name_en}",${s.stream},${s.paper_set},${s.password}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credentials_${new Date().getFullYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep("upload");
    setRawRows([]);
    setHeaders([]);
    setResult(null);
    setParseError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="w-full">
      {showCreate && (
        <CreateStudentModal
          centres={centres}
          sets={sets}
          examId={examId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { onImported(); }}
        />
      )}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Import Students
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-700 border-2 border-brand-200 px-4 h-10 hover:bg-brand-50 transition-all rounded-lg"
          >
            <UserPlus className="w-4 h-4" />
            Create Student
          </button>
          {step !== "upload" && (
            <button
              onClick={reset}
              className="text-stone-600 font-medium px-3 h-9 hover:bg-stone-100 hover:text-stone-900 transition-colors"
            >
              Start over
            </button>
          )}
        </div>
      </div>
      <p className="text-stone-500 text-sm mb-4">
        Upload a CSV or Excel file, map the columns, then import.
      </p>

      {/* Exam assignment notice */}
      {examId && examName ? (
        <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 px-4 py-3 mb-6 rounded-lg">
          <span className="text-[10px] uppercase tracking-widest font-bold text-brand-500">Target exam</span>
          <span className="text-brand-900 font-bold text-sm tracking-tight">{examName}</span>
          <span className="text-brand-400 text-[10px] font-bold uppercase tracking-widest opacity-50 ml-auto">ID {examId}</span>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 px-4 py-3 mb-6 text-sm text-amber-800 font-medium">
          No exam selected. Use the exam picker in the sidebar to choose a target exam before importing.
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {(["upload", "map", "preview", "done"] as Step[]).map((s, i) => {
          const isActive = step === s;
          const isPassed =
            ["upload", "map", "preview", "done"].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-4">
              {i > 0 && <span className="text-stone-300">/</span>}
              <span
                className={`text-[10px] uppercase tracking-widest font-bold ${isActive
                  ? "text-brand-700"
                  : isPassed
                    ? "text-teal-700"
                    : "text-stone-400"
                  }`}
              >
                {s}
              </span>
            </div>
          );
        })}
      </div>

      {parseError && (
        <div className="bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900 mb-6">
          {parseError}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          onClick={() => fileRef.current?.click()}
          className="bg-stone-50 border-2 border-dashed border-stone-200 p-16 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50 transition-all flex flex-col items-center justify-center rounded-lg group"
        >
          <UploadCloud className="w-12 h-12 text-stone-300 mb-4 group-hover:text-brand-400 transition-colors" />
          <p className="text-stone-700 font-semibold mb-1 text-base">
            Click to choose a file
          </p>
          <p className="text-stone-500 text-sm">Supports .csv, .xlsx, .xls</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === "map" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white border border-stone-200 shadow-sm p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-stone-900 mb-4">
              Map CSV Columns
            </h2>
            <div className="bg-stone-50 border border-stone-100 p-4 mb-5 rounded-lg">
              <p className="text-stone-900 text-sm font-semibold">
                {rawRows.length} rows detected
              </p>
              <p className="text-stone-500 text-xs mt-1 break-all">
                Columns: {headers.join(", ")}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map(
                (field) => (
                  <div key={field}>
                    <label className="text-sm font-medium text-stone-700 mb-1.5 flex items-center gap-1">
                      {FIELD_LABELS[field]}
                      {FIELD_REQUIRED[field] && (
                        <span className="text-brand-700">*</span>
                      )}
                    </label>
                    <select
                      value={mapping[field]}
                      onChange={(e) => setMap(field, e.target.value)}
                      className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm text-stone-900 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 rounded-lg focus:outline-none"
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm p-5">
            <h2 className="text-xl font-semibold text-stone-900 mb-4">
              Defaults &amp; Format
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                  DOB Format
                </label>
                <select
                  value={dobFormat}
                  onChange={(e) => setDobFormat(e.target.value)}
                  className="w-full border border-stone-300 shadow-sm px-3 py-2.5 text-sm text-stone-900 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
                >
                  <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                  <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="DDMMYYYY">DDMMYYYY (no separator)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                  Default Stream
                </label>
                <select
                  value={defaultStream}
                  onChange={(e) => setDefaultStream(e.target.value)}
                  className="w-full border border-stone-300 shadow-sm px-3 py-2.5 text-sm text-stone-900 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none rounded-lg"
                >
                  {["general", "commerce", "science", "humanities"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                  Default Centre
                </label>
                <select
                  value={defaultCentre}
                  onChange={(e) => setDefaultCentre(e.target.value)}
                  className="w-full border border-stone-300 shadow-sm px-3 py-2 text-sm text-stone-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">— Select —</option>
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_en}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("preview")}
              disabled={!canProceed}
              className="bg-brand-700 text-white font-bold text-[10px] uppercase tracking-widest px-6 h-10 shadow-md shadow-brand-900/10 hover:bg-brand-800 transition-all disabled:opacity-50 rounded-lg"
            >
              Preview Data
            </button>
            {!canProceed && (
              <p className="text-rose-600 text-sm flex items-center">
                Name, DOB, and Phone fields are required.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="border border-stone-200 overflow-hidden bg-white shadow-sm rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  {[
                    "Name (EN)",
                    "DOB",
                    "Phone",
                    "Stream",
                    "Course",
                    "Paper Set",
                    "Matched Centre",
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-stone-100 last:border-0 hover:bg-brand-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-stone-900 font-medium whitespace-nowrap">
                      {String(r.name_en || "")}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-stone-500 tabular-nums whitespace-nowrap">
                      {String(r.dob || "")}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-stone-500 tabular-nums whitespace-nowrap">
                      {String(r.phone || "")}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-700 whitespace-nowrap capitalize">
                      {String(r.stream || "")}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-700 whitespace-nowrap">
                      {String(r.course || "")}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-brand-700 whitespace-nowrap">
                      {String((r as any).paper_set || "—")}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-700 whitespace-nowrap font-semibold">
                      {String(r.resolved_centre_name || "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep("map")}
              className="bg-white text-stone-700 font-bold text-[10px] uppercase tracking-widest px-6 h-10 border-2 border-stone-200 hover:bg-stone-50 transition-all rounded-lg"
            >
              Go Back
            </button>
            <button
              onClick={handleImport}
              disabled={loading || !examId}
              className="bg-brand-700 text-white font-bold text-[10px] uppercase tracking-widest px-6 h-10 shadow-md shadow-brand-900/10 hover:bg-brand-800 transition-all disabled:opacity-50 flex items-center gap-2 rounded-lg"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                `Import ${rawRows.length} Students`
              )}
            </button>
            {!examId && (
              <p className="text-amber-700 text-sm flex items-center">Select an exam in the sidebar first.</p>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <div className="bg-white border border-stone-200 shadow-xl p-10 text-center rounded-lg animate-in zoom-in-95 duration-500">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-50 text-teal-700 mb-6 border-2 border-teal-100 rounded-full">
            <span className="text-3xl font-black">✓</span>
          </div>
          <h2 className="text-xl font-semibold text-stone-900 mb-2">
            {result.imported} students imported successfully
          </h2>

          {result.errors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 p-4 mb-6 text-left max-w-2xl mx-auto">
              <p className="text-rose-700 text-sm font-semibold mb-2">
                {result.errors.length} rows had errors
              </p>
              <pre className="text-xs text-rose-900/70 max-h-32 overflow-auto font-mono">
                {JSON.stringify(result.errors.slice(0, 10), null, 2)}
              </pre>
            </div>
          )}

          <div className="flex justify-center gap-3 mt-8">
            <button
              onClick={downloadCredentials}
              className="bg-brand-700 text-white font-bold text-[10px] uppercase tracking-widest px-6 h-10 shadow-md shadow-brand-900/10 hover:bg-brand-800 transition-all rounded-lg"
            >
              Download Credentials CSV
            </button>
            <button
              onClick={reset}
              className="bg-white text-stone-700 font-bold text-[10px] uppercase tracking-widest px-6 h-10 border-2 border-stone-200 hover:bg-stone-50 transition-all rounded-lg"
            >
              Import More
            </button>
          </div>
          <p className="text-stone-500 text-xs mt-6 uppercase tracking-widest">
            Password format: DDMMYYYY_last4phone
          </p>
        </div>
      )}
    </div>
  );
}