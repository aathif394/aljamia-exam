import { AlertTriangle, Loader2, X } from "lucide-react";
import type { CheatEvent } from "../../../hooks/useAntiCheat";
import React from "react";
import type { SectionPalette } from "./theme";

// ── Section Transition Banner ──
export const SectionTransitionBanner = React.memo(function SectionTransitionBanner({
  section,
  description,
  onDone,
  palette,
}: {
  section: number;
  description?: string;
  onDone: () => void;
  palette: SectionPalette;
}) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 mb-3 border ${palette.light} ${palette.border} shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 rounded-xl relative overflow-hidden`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${palette.bg}`} />
      <span
        className={`${palette.bg} text-white text-[10px] font-black px-3 py-1.5 uppercase tracking-[0.2em] flex-shrink-0 rounded-lg`}
      >
        SECTION {section}
      </span>
      <span className={`text-sm font-bold tracking-tight ${palette.text}`}>
        {description || "Starting now — read the instructions carefully"}
      </span>
    </div>
  );
});

// ── Strike Warning Overlay ──
export const StrikeWarning = React.memo(function StrikeWarning({
  count,
  event,
  onDismiss,
  onRequestFullscreen,
}: {
  count: number;
  event: CheatEvent;
  onDismiss: () => void;
  onRequestFullscreen: () => void;
}) {
  const messages: Record<CheatEvent, string> = {
    tab_switch: "You switched away from the exam tab.",
    window_blur: "The exam window lost focus.",
    fullscreen_exit: "You exited fullscreen mode.",
    devtools_open: "Developer tools were detected.",
    right_click: "Right-clicking is not allowed.",
    copy_attempt: "Copying content is not allowed.",
    keyboard_shortcut: "That keyboard shortcut is blocked during the exam.",
    split_screen: "Split-screen mode is not allowed during the exam.",
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white border-4 border-rose-600 shadow-2xl p-8 max-w-md w-full text-center scale-in-center rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-rose-600" />
        <div className="w-16 h-16 bg-rose-50 border-2 border-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-stone-900 text-xl font-black uppercase tracking-tight mb-3">
          SECURITY ALERT
        </h2>
        <p className="text-stone-600 text-sm mb-6 font-medium">{messages[event] || "A security violation was detected."}</p>

        <div className="flex justify-center gap-3 mb-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`w-4 h-4 border-2 ${n <= count ? "bg-rose-600 border-rose-700 shadow-[0_0_12px_rgba(225,29,72,0.5)]" : "bg-stone-50 border-stone-200"}`}
            />
          ))}
        </div>

        <p className="text-stone-500 text-[10px] mb-8 uppercase tracking-[0.3em] font-black">
          Strike {count} of 3
        </p>
        
        <button
          onClick={() => {
            onRequestFullscreen();
            onDismiss();
          }}
          className="w-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black uppercase tracking-widest h-14 transition-all shadow-lg shadow-rose-900/20 rounded-xl"
        >
          Confirm & Continue
        </button>
      </div>
    </div>
  );
});

// ── Submit Confirmation Modal ──
export const SubmitModal = React.memo(function SubmitModal({
  answeredCount,
  totalCount,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  answeredCount: number;
  totalCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  error?: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white border-t-8 border-brand-800 shadow-2xl p-8 max-w-md w-full text-center scale-in-center rounded-2xl">
        <h2 className="text-stone-900 text-xl font-black tracking-tight mb-3 uppercase">
          Final Submission
        </h2>
        <p className="text-stone-600 text-sm mb-6 font-medium">
          You have completed{" "}
          <span className="text-brand-900 font-black">{answeredCount}</span> of{" "}
          <span className="text-stone-900 font-black">{totalCount}</span>{" "}
          questions.
        </p>

        {error && (
          <div className="bg-rose-50 border-2 border-rose-200 text-rose-700 text-[10px] py-4 px-4 mb-6 font-black uppercase tracking-widest text-left flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {answeredCount < totalCount && !error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] py-3 px-4 mb-6 font-black uppercase tracking-widest">
            {totalCount - answeredCount} questions are still missing!
          </div>
        )}
        <p className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-8">
          Once submitted, your answers are final.
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="bg-white text-stone-700 border-2 border-stone-200 hover:bg-stone-50 h-14 font-black uppercase tracking-widest text-[10px] transition-all rounded-xl"
          >
            Review
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="bg-brand-800 hover:bg-brand-900 active:bg-brand-950 text-white disabled:opacity-60 h-14 font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-900/20 rounded-xl"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Submitting..." : "Submit Final"}
          </button>
        </div>
      </div>
    </div>
  );
});
