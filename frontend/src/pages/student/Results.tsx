import { useState, useEffect } from "react";
import { api, ApiError } from "../../api/client";
import type { PublicExamResult } from "../../types";
import { GraduationCap, Loader2, Trophy } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Results() {
  const [publishedExams, setPublishedExams] = useState<
    { id: number; name: string; code: string; published_at: string }[]
  >([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<PublicExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roll, setRoll] = useState("");

  useEffect(() => {
    api.exams
      .listPublished()
      .then((list) => {
        setPublishedExams(list);
        if (list.length === 1) setSelectedId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    setResult(null);
    setRoll("");
    api.exams
      .publicResults(selectedId)
      .then(setResult)
      .catch((e) => {
        if (e instanceof ApiError) setError(e.message);
        else setError("Failed to load results.");
      })
      .finally(() => setLoading(false));
  }, [selectedId]);

  const myResult = roll.trim()
    ? result?.results.find((r) => r.roll_number === roll.trim())
    : undefined;

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      {/* Brand header */}
      <div className="bg-brand-950 px-6 py-6 flex items-center gap-4">
        <div className="w-10 h-10 bg-white/10 flex items-center justify-center border border-white/10">
          <GraduationCap className="w-5 h-5 text-gold-400" />
        </div>
        <div>
          <p className="text-white font-black text-xs uppercase tracking-[0.2em] leading-none mb-1">
            Al Jamia Al Islamiya
          </p>
          <p className="text-brand-400 text-[10px] font-bold uppercase tracking-widest">
            Examination Results
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-10">
        {loading && !result && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-stone-300" />
          </div>
        )}

        {/* No results published */}
        {!loading && publishedExams.length === 0 && (
          <div className="bg-white border-2 border-stone-200 p-10 text-center">
            <Trophy className="w-10 h-10 mx-auto mb-4 text-stone-200" />
            <p className="text-stone-700 font-black text-sm uppercase tracking-[0.15em] mb-2">
              Not Published Yet
            </p>
            <p className="text-stone-400 text-xs">
              Results will appear here once the examination board publishes them.
            </p>
          </div>
        )}

        {/* Exam selector (multiple exams) */}
        {publishedExams.length > 1 && (
          <div className="mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 mb-3">
              Select Exam
            </p>
            <div className="flex flex-wrap gap-2">
              {publishedExams.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`px-4 h-10 text-xs font-bold uppercase tracking-widest border-2 transition-colors ${
                    selectedId === e.id
                      ? "bg-brand-800 text-white border-brand-800"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border-2 border-rose-200 px-4 py-3 text-sm text-rose-800 font-medium">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-white border-2 border-stone-200 overflow-hidden">
            {/* Card header */}
            <div className="bg-brand-900 px-6 py-5">
              <p className="text-white font-black text-base uppercase tracking-[0.1em] leading-tight mb-1">
                {result.exam_name}
              </p>
              {result.results[0]?.name_ar && (
                <p className="text-brand-300 font-arabic text-sm mt-1" dir="rtl">
                   النتائج الرسمية
                </p>
              )}
              <p className="text-brand-400 text-[10px] font-bold uppercase tracking-widest mt-2">
                Published {formatDate(result.published_at)}
              </p>
            </div>

            <div className="px-6 py-6 space-y-5">
              {/* Roll number input */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 block mb-2">
                  Your Roll Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter roll number…"
                    value={roll}
                    onChange={(e) => setRoll(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    className="flex-1 border-2 border-stone-200 focus:border-brand-500 px-4 py-3 text-base font-mono focus:outline-none transition-colors"
                  />
                  {roll && (
                    <button
                      onClick={() => setRoll("")}
                      className="px-4 text-stone-400 hover:text-stone-700 border-2 border-stone-200 text-sm font-bold uppercase tracking-widest transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Result found */}
              {myResult && (
                <div className="border-2 border-teal-300 overflow-hidden">
                  <div className="bg-teal-600 px-5 py-3 flex items-center gap-3">
                    <Trophy className="w-4 h-4 text-white/70" />
                    <p className="text-white font-black text-xs uppercase tracking-[0.15em]">
                      Result Found
                    </p>
                  </div>
                  <div className="px-5 py-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 mt-1">
                        Name
                      </span>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-stone-900 font-bold text-sm truncate">
                          {myResult.name_en}
                        </span>
                        {myResult.name_ar && (
                          <span className="text-brand-800 font-arabic text-lg mt-0.5" dir="rtl">
                            {myResult.name_ar}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                        Roll Number
                      </span>
                      <span className="text-stone-900 font-mono text-sm">
                        {myResult.roll_number}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                        Stream
                      </span>
                      <span className="text-stone-900 text-sm font-semibold capitalize">
                        {myResult.stream}
                      </span>
                    </div>
                    <div className="pt-4 border-t-2 border-stone-100 flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                        Final Score
                      </span>
                      <span className="text-teal-700 font-black text-3xl tabular-nums">
                        {myResult.score.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Not found */}
              {roll.length > 3 && !myResult && !loading && (
                <div className="border-2 border-stone-200 px-5 py-4 text-center">
                  <p className="text-stone-600 font-bold text-xs uppercase tracking-[0.15em] mb-1">
                    Not Found
                  </p>
                  <p className="text-stone-400 text-xs">
                    Check your roll number and try again.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
