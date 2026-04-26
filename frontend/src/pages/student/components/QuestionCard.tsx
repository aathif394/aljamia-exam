import { useRef, useEffect } from "react";
import type { Question } from "../../../types";
import React from "react";
import { CheckCircle2 } from "lucide-react";
import { type SectionPalette } from "./theme";

const TYPE_LABEL: Record<string, string> = {
  mcq: "Multiple Choice",
  true_false: "True / False",
  fill_blank: "Fill in the Blank",
  descriptive: "Descriptive",
};

export const QuestionCard = React.memo(function QuestionCard({
  question,
  answer,
  onAnswer,
  lang,
  palette,
  fontSizeMultiplier = 1,
}: {
  question: Question;
  answer: string;
  onAnswer: (a: string) => void;
  lang: "en" | "ar";
  palette: SectionPalette;
  fontSizeMultiplier?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Only auto-focus when question ID changes (navigation)
    if (question.type === "fill_blank" && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (question.type === "descriptive" && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [question.id, question.type]);

  const hasArabicContent = !!question.question_ar?.trim();
  const hasEnglishContent = !!question.question_en?.trim();
  const isAr =
    lang === "ar" ||
    question.language === "ar" ||
    (hasArabicContent && !hasEnglishContent);

  const qText = isAr
    ? question.question_ar || question.question_en
    : question.question_en || question.question_ar;

  const parseOptions = (opts: unknown): string[] => {
    let arr: unknown[];
    if (Array.isArray(opts)) {
      arr = opts;
    } else if (typeof opts === "string") {
      try {
        const parsed = JSON.parse(opts);
        arr = Array.isArray(parsed) ? parsed : [];
      } catch {
        arr = [];
      }
    } else {
      arr = [];
    }
    return arr.filter((o): o is string => typeof o === "string" && o.trim() !== "");
  };

  const optionsAr = parseOptions(question.options_ar);
  const optionsEn = parseOptions(question.options_en);
  const options = isAr ? (optionsAr.length > 0 ? optionsAr : optionsEn) : optionsEn;
  const optionLabels = ["A", "B", "C", "D", "E", "F"];

  // Base font sizes for different elements
  const questionBaseSize = isAr ? 36 : 24; // 4xl vs 2xl
  const optionBaseSize = isAr ? 20 : 14; // xl vs sm
  const inputBaseSize = isAr ? 24 : 18; // 2xl vs lg
  const textareaBaseSize = isAr ? 20 : 16; // xl vs base

  return (
    <div className={isAr ? "rtl font-arabic" : "ltr"} dir={isAr ? "rtl" : "ltr"}>
      <p 
        className="text-stone-900 font-bold leading-relaxed mb-10 select-none tracking-tight"
        style={{ fontSize: `${questionBaseSize * fontSizeMultiplier}px` }}
      >
        {qText}
      </p>

      {question.type === "mcq" && (
        <div className="space-y-3">
          {options.map((opt, i) => {
            const label = optionLabels[i] || String(i);
            const selected = answer === label;
            return (
              <button
                key={i}
                onClick={() => onAnswer(selected ? "" : label)}
                className={`w-full px-4 py-4 border-2 transition-all min-h-[70px] active:scale-[0.99] flex flex-row items-center gap-4 rounded-xl shadow-sm
                  ${selected
                    ? `${palette.light} ${palette.border} shadow-md`
                    : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300 hover:shadow-md active:bg-stone-100"
                  }`}
                style={{ fontSize: `${optionBaseSize * fontSizeMultiplier}px` }}
              >
                <span
                  className={`flex-shrink-0 rounded-full flex items-center justify-center font-black transition-all
                    ${isAr ? 'w-11 h-11 text-base' : 'w-9 h-9 text-sm'}
                    ${selected
                      ? `${palette.bg} text-white shadow-sm`
                      : "bg-stone-100 text-stone-500 group-hover:bg-stone-200"
                    }`}
                >
                  {label}
                </span>
                <span className={`flex-1 text-start font-medium leading-snug ${selected ? palette.text : "text-stone-800"}`}>{opt}</span>
                {selected && (
                  <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${palette.text}`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {question.type === "true_false" && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: isAr ? "صحيح" : "True", value: "true" },
            { label: isAr ? "خطأ" : "False", value: "false" },
          ].map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onAnswer(answer === value ? "" : value)}
              className={`py-5 border font-semibold transition-all shadow-sm min-h-[64px] active:scale-[0.98]
                ${answer === value
                  ? value === "true"
                    ? "bg-teal-50 border-teal-500 text-teal-900"
                    : "bg-rose-50 border-rose-500 text-rose-900"
                  : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50 active:bg-stone-100 hover:border-stone-300"
                }`}
              style={{ fontSize: `${(isAr ? 20 : 16) * fontSizeMultiplier}px` }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {question.type === "fill_blank" && (
        <div>
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => onAnswer(e.target.value)}
            placeholder={isAr ? "اكتب إجابتك هنا" : "Type your answer here"}
            maxLength={200}
            className="relative z-10 cursor-text select-text w-full bg-white border-2 border-stone-200 px-5 py-5 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-600 font-bold transition-all rounded-xl"
            style={{ fontSize: `${inputBaseSize * fontSizeMultiplier}px` }}
            dir={isAr ? "rtl" : "ltr"}
          />
          <p className="text-stone-400 text-[10px] mt-2 font-black uppercase tracking-widest text-end tabular-nums italic">
            {answer.length} / 200 characters
          </p>
        </div>
      )}

      {question.type === "descriptive" && (
        <div>
          <textarea
            ref={textareaRef}
            value={answer}
            onChange={(e) => onAnswer(e.target.value)}
            placeholder={isAr ? "اكتب إجابتك هنا..." : "Write your answer here..."}
            rows={8}
            maxLength={1000}
            className="relative z-10 cursor-text select-text w-full bg-white border-2 border-stone-200 px-5 py-5 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-600 font-medium resize-none transition-all rounded-xl"
            style={{ fontSize: `${textareaBaseSize * fontSizeMultiplier}px` }}
            dir={isAr ? "rtl" : "ltr"}
          />
          <p className="text-stone-400 text-[10px] mt-2 font-black uppercase tracking-widest text-end tabular-nums italic">
            {answer.length} / 1000 characters
          </p>
        </div>
      )}
    </div>
  );
});

export { TYPE_LABEL };
