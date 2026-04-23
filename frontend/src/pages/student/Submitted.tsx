import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";
import { useExamStore } from "../../stores/examStore";
import { CheckCircle, GraduationCap, Loader2, ExternalLink } from "lucide-react";
import type { PublicExamResult } from "../../types";

export default function Submitted() {
  const navigate = useNavigate();
  const student = useAuthStore((s) => s.studentAuth?.student);
  const clearStudent = useAuthStore((s) => s.clearStudent);
  const { questions, answers } = useExamStore();

  const [publishedExamName, setPublishedExamName] = useState<string | null>(null);
  const [checkingResults, setCheckingResults] = useState(true);

  const answeredCount = Object.values(answers).filter((a) => a && a.trim()).length;

  useEffect(() => {
    if (!student?.roll_number) {
      setCheckingResults(false);
      return;
    }

    const checkResults = async () => {
      try {
        const examState = await api.student.getQuestions();
        if (examState.status === "active") {
          navigate("/exam", { replace: true });
          return;
        }
        if (examState.status !== "submitted" && examState.status !== "flagged") {
          navigate("/", { replace: true });
          return;
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          navigate("/", { replace: true });
          return;
        }
      }

      try {
        const publishedList = await api.exams.listPublished();
        for (const exam of publishedList) {
          try {
            const resultData: PublicExamResult = await api.exams.publicResults(exam.id);
            const myData = resultData.results.find(
              (r) => r.roll_number === student.roll_number,
            );
            if (myData) {
              setPublishedExamName(resultData.exam_name);
              break;
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // fail silently
      } finally {
        setCheckingResults(false);
      }
    };

    checkResults();
  }, [student?.roll_number]);

  const handleSignOut = () => {
    clearStudent();
    navigate("/");
  };

  if (checkingResults) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 shadow-xl w-full max-w-md overflow-hidden"
        style={{ borderColor: publishedExamName ? "#1e40af" : "#0d9488" }}>

        {/* Header band */}
        <div className={`px-8 pt-8 pb-7 ${publishedExamName ? "bg-brand-800" : "bg-teal-600"}`}>
          {publishedExamName
            ? <GraduationCap className="w-8 h-8 text-white/60 mb-3" />
            : <CheckCircle className="w-8 h-8 text-white/60 mb-3" />
          }
          <p className="text-white font-black text-lg uppercase tracking-[0.15em] leading-tight">
            {publishedExamName ? "Results Available" : "Exam Submitted"}
          </p>
          <p className={`text-xs mt-1 font-medium ${publishedExamName ? "text-brand-200" : "text-teal-100"}`}>
            {publishedExamName
              ? publishedExamName
              : "Your answers have been securely recorded"
            }
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          {publishedExamName ? (
            <div className="text-center space-y-4">
              <p className="text-stone-600 text-sm leading-relaxed">
                The examination board has published results for this exam.
              </p>
              <a
                href="/results"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-brand-800 hover:bg-brand-900 text-white font-black uppercase tracking-[0.15em] text-xs h-12 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Results Page
              </a>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <Row label="Roll Number" value={student?.roll_number || "—"} mono />
                <Row label="Student Name" value={student?.name_en || "—"} />
                <Row label="Stream" value={student?.stream || "—"} className="capitalize" />
                <Row label="Paper Set" value={student?.paper_set || "—"} />
                {questions.length > 0 && (
                  <div className="pt-3 border-t border-stone-100 flex justify-between items-center">
                    <span className="text-stone-400 text-[10px] font-black uppercase tracking-[0.2em]">
                      Questions Answered
                    </span>
                    <span className="text-stone-900 font-black tabular-nums text-sm">
                      {answeredCount} / {questions.length}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-stone-400 text-[10px] font-black uppercase tracking-[0.2em] text-center pt-1">
                Please remain seated until dismissed
              </p>
              <p className="text-stone-500 text-xs text-center">
                Results will be published by the examination board.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8">
          <button
            onClick={handleSignOut}
            className="w-full border-2 border-stone-200 bg-white hover:bg-stone-50 text-stone-600 font-black uppercase tracking-[0.15em] text-xs h-11 transition-colors"
          >
            Sign Out Session
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  className = "",
  mono = false,
}: {
  label: string;
  value: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-stone-400 text-[10px] font-black uppercase tracking-[0.2em]">
        {label}
      </span>
      <span className={`text-stone-900 text-sm font-semibold ${mono ? "font-mono" : ""} ${className}`}>
        {value}
      </span>
    </div>
  );
}
