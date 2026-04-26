import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";
import { useExamStore } from "../../stores/examStore";
import { useAntiCheat, type CheatEvent } from "../../hooks/useAntiCheat";
import { useExamTimer } from "../../hooks/useExamTimer";
import {
  Menu,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

// Components
import { QuestionCard, TYPE_LABEL } from "./components/QuestionCard";
import { StrikeWarning, SubmitModal, SectionTransitionBanner } from "./components/ExamModals";
import { Watermark } from "./components/Watermark";
import { getSectionPalette, SECTION_PALETTES } from "./components/theme";
import DecorativeBackground from "../../components/DecorativeBackground";

export default function ExamPage() {
  const navigate = useNavigate();
  const student = useAuthStore((s) => s.studentAuth?.student);

  // ── Selective Store Selectors (Prevents entire page re-rendering on typing) ──
  const questions = useExamStore((s) => s.questions);
  const answers = useExamStore((s) => s.answers);
  const currentIndex = useExamStore((s) => s.currentIndex);
  const startTime = useExamStore((s) => s.startTime);
  const durationMinutes = useExamStore((s) => s.durationMinutes);
  const strikes = useExamStore((s) => s.strikes);
  const status = useExamStore((s) => s.status);
  const sectionDescriptions = useExamStore((s) => s.sectionDescriptions);
  
  const setAnswer = useExamStore((s) => s.setAnswer);
  const setCurrentIndex = useExamStore((s) => s.setCurrentIndex);
  const setStatus = useExamStore((s) => s.setStatus);
  const initializeExam = useExamStore((s) => s.initializeExam);
  const addStrike = useExamStore((s) => s.addStrike);

  const [loading, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [strike, setStrike] = useState<{
    count: number;
    event: CheatEvent;
  } | null>(null);
  const [showNav, setShowNav] = useState(false);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [started, setStarted] = useState(false);
  const [startError, setStartError] = useState("");
  const [sectionTransition, setSectionTransition] = useState<number | null>(null);
  const [examStartTime, setExamStartTime] = useState<Date | null>(null);
  const [examOpen, setExamOpen] = useState(true);
  const [countdown, setCountdown] = useState("");
  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingAnswers = useRef<Map<number, string>>(new Map());
  const mainRef = useRef<HTMLElement>(null);
  const monitorWsRef = useRef<WebSocket | null>(null);
  const currentIndexRef = useRef(0);
  const submittingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error" | null>(null);
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem("exam-font-size");
    return saved ? parseFloat(saved) : 1;
  });

  useEffect(() => {
    localStorage.setItem("exam-font-size", fontSize.toString());
  }, [fontSize]);

  // Cleanup saveStatusTimer on unmount
  useEffect(() => () => {
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
  }, []);

  // ── Section timing ──────────────────────────────────────────────────────────
  const [sectionDurations, setSectionDurations] = useState<Record<string, number>>({});
  const [sectionAutoAdvance, setSectionAutoAdvance] = useState(false);
  const [currentSectionNum, setCurrentSectionNum] = useState<number>(1);
  const [sectionStartTime, setSectionStartTime] = useState<string | null>(null);
  const [sectionCountdown, setSectionCountdown] = useState("");
  const [sectionExpired, setSectionExpired] = useState(false);
  const sectionAdvancing = useRef(false);

  const { formatted: timerText, isWarning, isExpired } = useExamTimer(
    startTime,
    durationMinutes,
  );

  // ── Auto-save every 15 s (backup for network blips) ────────────────────────
  const lastAutoSaved = useRef<Record<string, string>>({});

  function showSaveStatus(status: "saved" | "error") {
    setSaveStatus(status);
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    if (status === "saved") {
      saveStatusTimer.current = setTimeout(() => setSaveStatus(null), 2000);
    }
  }

  useEffect(() => {
    if (!started || status === "submitted") return;
    const id = setInterval(() => {
      const current = useExamStore.getState().answers;
      const unsaved = Object.entries(current).filter(([k, v]) => v && v !== lastAutoSaved.current[k]);
      if (unsaved.length === 0) return;
      setSaveStatus("saving");
      Promise.all(
        unsaved.map(([k, v]) =>
          api.student.saveAnswer(Number(k), v).then(() => {
            lastAutoSaved.current[k] = v;
          })
        )
      ).then(() => showSaveStatus("saved"))
       .catch(() => showSaveStatus("error"));
    }, 15_000);
    return () => clearInterval(id);
  }, [started, status]);

  // ── Section grouping ────────────────────────────────────────────────────────
  const sectionGroups = useMemo(() => {
    const map = new Map<
      number,
      { questions: Array<{ q: any; idx: number }>; answered: number }
    >();
    questions.forEach((q, idx) => {
      if (!map.has(q.section)) map.set(q.section, { questions: [], answered: 0 });
      const entry = map.get(q.section)!;
      entry.questions.push({ q, idx });
      if (answers[String(q.id)]?.trim()) entry.answered++;
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [questions, answers]);

  useEffect(() => {
    if (!student) navigate("/", { replace: true });
  }, [student, navigate]);

  useEffect(() => {
    if (!student) return;
    
    // Always attempt to fetch questions to see if we can resume
    // This fixes the issue where a student refreshes and their local status is stale
    api.student
      .getQuestions()
      .then((res) => {
        // If we get questions, it means the exam is active/flagged on the server
        initializeExam(res);
        if (res.section_durations) setSectionDurations(res.section_durations);
        if (res.section_auto_advance != null) setSectionAutoAdvance(res.section_auto_advance);
        if (res.current_section) setCurrentSectionNum(res.current_section);
        if (res.section_start_time !== undefined) setSectionStartTime(res.section_start_time);
        setStatus(res.status);
        setStarted(true);
      })
      .catch((err) => {
        // If the server says they have submitted, honor that immediately
        if (err instanceof ApiError && err.status === 403 && err.message.toLowerCase().includes("submitted")) {
          navigate("/submitted", { replace: true });
          return;
        }
        // Fallback to checking the student object in auth
        if (student.status === "submitted") {
          navigate("/submitted", { replace: true });
        }
      });
  }, []);

  // Keep a ref so the isExpired effect always calls the current handleSubmit,
  // not a stale closure from the first render.
  const handleSubmitRef = useRef<(auto?: boolean) => Promise<void>>(async () => {});
  // ── Auto-submit on expiration ───────────────────────────────────────────────
  useEffect(() => {
    // Only auto-submit if the exam is active and actually expired.
    // We add a small 'started' check to ensure we've at least loaded the initial state.
    if (isExpired && started && (status === "active" || status === "flagged")) {
      console.log("Timer expired, auto-submitting...");
      handleSubmitRef.current(true);
    }
  }, [isExpired, started, status]);

  // ── Redirect if submitted ──────────────────────────────────────────────────
  useEffect(() => {
    if (started && status === "submitted") {
      navigate("/submitted", { replace: true });
    }
  }, [started, status, navigate]);

  // ── Section countdown ticker ────────────────────────────────────────────────
  useEffect(() => {
    if (!started || !sectionStartTime) return;
    const limitMins = sectionDurations[String(currentSectionNum)];
    if (!limitMins) {
      setSectionCountdown("");
      setSectionExpired(false);
      return;
    }
    const endMs = new Date(sectionStartTime).getTime() + limitMins * 60 * 1000;
    const tick = () => {
      const diff = endMs - Date.now();
      if (diff <= 0) {
        setSectionCountdown("00:00");
        setSectionExpired(true);
      } else {
        const s = Math.floor(diff / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        setSectionCountdown(`${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
        setSectionExpired(false);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [started, sectionStartTime, currentSectionNum, sectionDurations]);

  // ── Section auto-advance ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sectionExpired || !sectionAutoAdvance || sectionAdvancing.current) return;
    const sections = sectionGroups.map(([s]) => s).sort((a, b) => a - b);
    const nextSection = sections.find((s) => s > currentSectionNum);
    if (!nextSection) return;
    sectionAdvancing.current = true;
    api.student.advanceSection()
      .then((res) => {
        setCurrentSectionNum(res.current_section);
        setSectionStartTime(res.section_start_time);
        setSectionExpired(false);
        const newGroup = sectionGroups.find(([s]) => s === res.current_section);
        if (newGroup) {
          const firstIdx = newGroup[1].questions[0]?.idx;
          if (firstIdx != null) navigateTo(firstIdx);
        }
        setSectionTransition(res.current_section);
      })
      .catch(() => { })
      .finally(() => { sectionAdvancing.current = false; });
  }, [sectionExpired, sectionAutoAdvance]);

  useEffect(() => {
    if (started) return;
    api.student.publicConfig().then((cfg) => {
      if (cfg.test_mode) {
        setExamOpen(true);
      } else if (cfg.exam_start_time) {
        const st = new Date(cfg.exam_start_time);
        setExamStartTime(st);
        setExamOpen(st <= new Date());
      } else {
        setExamOpen(false);
      }
    }).catch(() => setExamOpen(true));
  }, [started]);

  useEffect(() => {
    if (!examStartTime || examOpen) return;
    const tick = () => {
      const diff = examStartTime.getTime() - Date.now();
      if (diff <= 0) { setExamOpen(true); setCountdown(""); }
      else {
        const s = Math.floor(diff / 1000);
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        setCountdown(d > 0 ? `${d}d ${hms}` : hms);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [examStartTime, examOpen]);

  currentIndexRef.current = currentIndex;

  useEffect(() => {
    if (!started || status === "submitted") return;
    let active = true;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!active) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/student?token=${token}`);
      ws.onopen = () => {
        retryDelay = 1000;
        ws.send(JSON.stringify({ type: "viewing", question_index: currentIndexRef.current }));
      };
      ws.onclose = (e) => {
        monitorWsRef.current = null;
        if (active && e.code !== 1000) {
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      };
      monitorWsRef.current = ws;
    }

    connect();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      monitorWsRef.current?.close(1000);
      monitorWsRef.current = null;
    };
  }, [started, status]);

  const handleStart = async () => {
    setStartLoading(true);
    setStartError("");
    try {
      const res = await api.student.startExam();
      if (res.resume) {
        const state = await api.student.getQuestions();
        initializeExam(state);
        if (state.section_durations) setSectionDurations(state.section_durations);
        if (state.section_auto_advance != null) setSectionAutoAdvance(state.section_auto_advance);
        if (state.current_section) setCurrentSectionNum(state.current_section);
        if (state.section_start_time !== undefined) setSectionStartTime(state.section_start_time);
      } else {
        initializeExam(res);
        if (res.section_durations) setSectionDurations(res.section_durations);
        if (res.section_auto_advance != null) setSectionAutoAdvance(res.section_auto_advance);
        setCurrentSectionNum(1);
        setSectionStartTime(new Date().toISOString());
        setSectionTransition(1);
      }
      setStatus("active");
      setStarted(true);
      requestFullscreen();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          try {
            const detail = JSON.parse(err.message);
            if (detail?.code === "EXAM_NOT_STARTED") {
              if (detail.exam_start_time) setExamStartTime(new Date(detail.exam_start_time));
              setExamOpen(false);
            } else if (detail?.code === "NOT_ON_EXAM_NETWORK") {
              setStartError("You must be connected to the exam WiFi network to begin.");
            } else {
              setStartError(err.message);
            }
          } catch {
            setStartError(err.message);
          }
        } else {
          setStartError(err.message);
        }
      } else {
        setStartError("Failed to start exam. Please refresh and try again.");
      }
    } finally {
      setStartLoading(false);
    }
  };

  const handleAnswer = useCallback(
    (answer: string) => {
      const q = questions[currentIndex];
      if (!q) return;
      setAnswer(q.id, answer);
      pendingAnswers.current.set(q.id, answer);
      const existing = saveTimers.current.get(q.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        saveTimers.current.delete(q.id);
        pendingAnswers.current.delete(q.id);
        setSaveStatus("saving");
        api.student.saveAnswer(q.id, answer)
          .then(() => showSaveStatus("saved"))
          .catch(() => showSaveStatus("error"));
      }, 300);
      saveTimers.current.set(q.id, timer);
    },
    [questions, currentIndex, setAnswer],
  );

  const handleSubmit = async (auto = false) => {
    if (!auto && !showSubmit) {
      setShowSubmit(true);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setShowSubmit(false);
    setLoading(true);
    setSubmitError(null);
    try {
      // Flush any buffered answer saves before submitting
      const flushPromises: Promise<unknown>[] = [];
      for (const [qId, timer] of saveTimers.current) {
        clearTimeout(timer);
        const answer = pendingAnswers.current.get(qId);
        if (answer !== undefined) {
          flushPromises.push(api.student.saveAnswer(qId, answer).catch(() => {}));
        }
      }
      saveTimers.current.clear();
      pendingAnswers.current.clear();
      if (flushPromises.length > 0) await Promise.all(flushPromises);

      await api.student.submit();
      setStatus("submitted");
      navigate("/submitted");
    } catch (err: any) {
      console.error("Submission failed:", err);
      setSubmitError(err.message || "An unexpected error occurred during submission. Please try again or contact your invigilator.");
      setShowSubmit(true); // Keep modal open
      submittingRef.current = false; // Allow retry on explicit error
    } finally {
      setLoading(false);
    }
  };
  handleSubmitRef.current = handleSubmit;

  const onStrike = useCallback(
    (count: number, newStatus: string, event: CheatEvent) => {
      addStrike(count, newStatus);
      setStrike({ count, event });
      if (newStatus === "submitted") navigate("/submitted");
    },
    [addStrike, navigate],
  );

  const { requestFullscreen } = useAntiCheat({
    // Disable during submit modal/loading — prevents false strikes while student
    // is reading the confirmation or waiting for network response.
    enabled: started && status !== "submitted" && !loading && !showSubmit,
    onStrike,
    onFullscreenLost: () => { },
  });

  const navigateTo = useCallback(
    (newIdx: number) => {
      const newQ = questions[newIdx];
      const curQ = questions[currentIndex];
      if (newQ && curQ && newQ.section !== curQ.section) {
        setSectionTransition(newQ.section);
      }
      setCurrentIndex(newIdx);
      monitorWsRef.current?.send(JSON.stringify({ type: "viewing", question_index: newIdx }));
      requestAnimationFrame(() => {
        mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    [questions, currentIndex, setCurrentIndex],
  );

  const questionIdSet = useMemo(() => new Set(questions.map((q) => String(q.id))), [questions]);
  const answeredCount = useMemo(
    () => Object.entries(answers).filter(([k, a]) => questionIdSet.has(k) && a && a.trim()).length,
    [answers, questionIdSet],
  );

  if (!student) return null;

  const current = questions[currentIndex];
  const palette = current ? getSectionPalette(current.section) : SECTION_PALETTES[0];

  const currentSectionGroup = current
    ? sectionGroups.find(([s]) => s === current.section)
    : undefined;
  const posInSection = currentSectionGroup
    ? currentSectionGroup[1].questions.findIndex(({ idx }) => idx === currentIndex) + 1
    : 0;
  const totalInSection = currentSectionGroup
    ? currentSectionGroup[1].questions.length
    : 0;

  if (!started) {
    return (
      <div className="min-h-screen bg-brand-950 flex flex-col items-center justify-center p-5 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-brand-700/20 rounded-full blur-[130px]" />
          <div className="absolute top-1/2 -right-32 w-[500px] h-[500px] bg-gold-500/8 rounded-full blur-[110px]" />
          <div className="absolute -bottom-32 left-1/4 w-[550px] h-[550px] bg-brand-800/25 rounded-full blur-[150px]" />
        </div>

        {/* Institution mark */}
        <div className="relative z-10 mb-6 text-center flex flex-col items-center">
          <div className="mb-4 bg-white/8 p-3 border border-white/15 backdrop-blur-sm rounded-xl">
            <img src="/logo.png" alt="Al Jamia Al Islamiya" className="h-14 sm:h-16 w-auto object-contain brightness-0 invert" />
          </div>
          <h1 className="text-white font-black text-lg uppercase tracking-tight leading-none">Al Jamia Al Islamiya</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="h-px w-8 bg-gold-500/50" />
            <p className="text-gold-400 text-[8px] uppercase tracking-[0.25em] font-bold">Admission Examination</p>
            <div className="h-px w-8 bg-gold-500/50" />
          </div>
        </div>

        <div className="relative z-10 w-full max-w-md rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          <div className="h-1 bg-gradient-to-r from-gold-700 via-gold-400 to-gold-700 shadow-[0_2px_12px_rgba(182,142,74,0.4)]" />
          <div className="bg-white">
            {/* Candidate info strip */}
            <div className="bg-brand-900 px-6 py-3 flex items-center justify-between">
              <div>
                <p className="text-brand-300/50 text-[8px] uppercase tracking-widest font-black">Roll Number</p>
                <p className="text-white font-mono font-black text-sm">{student.roll_number}</p>
              </div>
              <div className="text-right">
                <p className="text-brand-300/50 text-[8px] uppercase tracking-widest font-black">Stream · Set</p>
                <p className="text-gold-400 font-black text-sm uppercase">{student.stream} · Set {student.paper_set}</p>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              {/* Rules */}
              <div className="border border-brand-100 bg-brand-50 p-5 mb-6">
                <p className="text-brand-800 text-[9px] font-black uppercase tracking-[0.2em] mb-3 border-b border-brand-100 pb-2">
                  Examination Integrity Rules
                </p>
                <ul className="space-y-2.5">
                  <li className="flex gap-2.5 text-sm text-brand-900 font-medium"><span className="text-brand-400 font-black mt-0.5">▸</span><span>Do not close, minimize, or switch the app.</span></li>
                  <li className="flex gap-2.5 text-sm text-brand-900 font-medium"><span className="text-brand-400 font-black mt-0.5">▸</span><span>Remain in fullscreen mode at all times.</span></li>
                  <li className="flex gap-2.5 text-sm text-brand-900 font-medium"><span className="text-brand-400 font-black mt-0.5">▸</span><span>Home and Back buttons are disabled.</span></li>
                  <li className="flex gap-2.5 text-sm font-bold text-rose-700"><span className="font-black mt-0.5">▸</span><span>3 violations will automatically flag and submit your exam.</span></li>
                </ul>
              </div>

              {!examOpen && examStartTime && (
                <div className="bg-amber-50 border border-amber-200 p-4 mb-5 text-center">
                  <p className="text-amber-700 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Gate Opens In</p>
                  <p className="text-amber-900 text-3xl font-mono font-black tabular-nums">{countdown || "..."}</p>
                </div>
              )}

              {startError && (
                <div className="bg-rose-50 border-l-4 border-rose-500 px-4 py-3 mb-5">
                  <p className="text-rose-700 text-sm font-medium">{startError}</p>
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={startLoading || !examOpen}
                className="w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black py-4 transition-all flex justify-center items-center gap-3 uppercase tracking-[0.2em] text-xs shadow-xl shadow-brand-900/30 active:scale-[0.98]"
              >
                {startLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                {startLoading ? "Initializing..." : !examOpen ? "Waiting for Portal..." : "Enter Examination"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

    return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans relative">
      <DecorativeBackground />
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200 sticky top-0 z-30 shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-brand-800 via-gold-500 to-brand-800" />
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button
            onClick={() => setShowNav(!showNav)}
            className="flex-shrink-0 w-9 h-9 border border-stone-300 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-50 active:bg-stone-100 transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
          
          <div className="flex-1 flex items-center gap-2.5 min-w-0">
            <img src="/logo.png" alt="Al Jamia" className="h-8 w-auto object-contain" />
            <div className="hidden sm:block">
              <p className="text-brand-900 font-bold text-[10px] uppercase tracking-tight leading-none">Al Jamia Al Islamiya</p>
              <p className="text-gold-600 text-[8px] font-bold uppercase tracking-widest mt-0.5">Examination Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            {current && (
              <span className={`${palette.bg} text-white text-[10px] font-black px-2.5 py-1 uppercase tracking-widest flex-shrink-0 rounded-lg`}>SECTION {current.section}</span>
            )}
            <span className="text-stone-900 text-sm font-black tracking-tight truncate">Q {currentIndex + 1} <span className="text-stone-400 font-medium lowercase">of {questions.length}</span></span>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 border border-stone-200 rounded-lg p-0.5 ml-2">
            <button
              onClick={() => setFontSize(s => Math.max(0.8, s - 0.1))}
              className="flex items-center gap-1.5 px-2.5 h-8 text-stone-600 hover:bg-white rounded-md transition-all active:scale-90"
              title="Decrease Font Size"
            >
              <span className="text-[10px] font-black uppercase tracking-tight">Smaller</span>
            </button>
            <div className="w-px h-4 bg-stone-300" />
            <button
              onClick={() => setFontSize(s => Math.min(1.8, s + 0.1))}
              className="flex items-center gap-1.5 px-2.5 h-8 text-stone-600 hover:bg-white rounded-md transition-all active:scale-90"
              title="Increase Font Size"
            >
              <span className="text-[10px] font-black uppercase tracking-tight">Larger</span>
            </button>
          </div>

          {questions.some((q) => q.language === "both" || q.language === "ar") && (
            <button
              onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
              className={`flex-shrink-0 h-9 px-3 border-2 border-brand-800 text-brand-800 font-black tracking-widest hover:bg-brand-50 transition-all rounded-lg ${lang === 'en' ? 'font-arabic text-sm' : 'text-[10px] uppercase'}`}
            >
              {lang === "en" ? "عربي" : "English"}
            </button>
          )}

          {sectionCountdown && (
            <div className={`flex-shrink-0 px-3 py-1 font-mono font-black text-[10px] border rounded-lg ${sectionExpired ? "bg-rose-600 text-white border-rose-700" : "bg-brand-50 text-brand-700 border-brand-100"}`}>
              SECTION {currentSectionNum} · {sectionCountdown}
            </div>
          )}

          {saveStatus && (
            <div className={`flex-shrink-0 px-2 py-1 text-[9px] font-bold uppercase tracking-widest border rounded ${saveStatus === "saved" ? "bg-teal-50 text-teal-700 border-teal-200" : saveStatus === "error" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-stone-100 text-stone-500 border-stone-200"}`}>
              {saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Save failed" : "Saving…"}
            </div>
          )}
          <div className={`flex-shrink-0 px-2 py-1 font-mono font-bold text-[10px] border ${isExpired ? "bg-rose-600 text-white border-rose-700" : isWarning ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-stone-100 text-stone-700 border-stone-200"}`}>
            {timerText}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 pb-3">
          <div className="flex-1 h-3 bg-stone-100 border-2 border-stone-200 overflow-hidden rounded-full">
            <div className={`h-full ${palette.progressBar} transition-all duration-500 shadow-[0_0_8px_rgba(114,19,44,0.3)]`} style={{ width: `${(answeredCount / Math.max(questions.length, 1)) * 100}%` }} />
          </div>
          <span className="text-stone-900 text-[10px] font-black font-mono flex-shrink-0 tabular-nums">{answeredCount} / {questions.length}</span>
          <div className="flex gap-1 border-l border-stone-200 pl-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`w-2.5 h-2.5 rounded-full border ${n <= strikes ? "bg-rose-500 border-rose-600 shadow-[0_0_4px_rgba(225,29,72,0.4)]" : "bg-stone-100 border-stone-300"}`} />
            ))}
          </div>
        </div>
      </header>

      {showNav && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setShowNav(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-80 max-w-[90vw] bg-white border-r border-stone-200 h-full overflow-y-auto shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
              <h2 className="text-brand-900 font-bold uppercase tracking-tight text-sm">Question Navigator</h2>
              <button onClick={() => setShowNav(false)} className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-900"><X className="w-4 h-4" /></button>
            </div>

            <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-3">
              <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">
                Progress: <span className="text-brand-900">{answeredCount}</span>/{questions.length}
              </span>
              <div className="flex-1 h-1 bg-stone-200 overflow-hidden">
                <div className="h-full bg-brand-600 transition-all" style={{ width: `${(answeredCount / Math.max(questions.length, 1)) * 100}%` }} />
              </div>
            </div>
            <div className="px-5 py-2 bg-brand-950 flex items-center justify-between">
              <span className="text-brand-300/60 text-[9px] font-bold uppercase tracking-widest">{student.roll_number}</span>
              <span className="text-gold-400 text-[9px] font-black uppercase tracking-widest">{student.stream} · Set {student.paper_set}</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sectionGroups.map(([sectionNum, { questions: sqs, answered: sectionAnswered }]) => {
                const pal = getSectionPalette(sectionNum);
                return (
                  <div key={sectionNum}>
                    <div className={`flex items-center justify-between px-5 py-3 border-y ${pal.light} ${pal.border}`}>
                      <div className="flex items-center gap-2">
                        <span className={`${pal.bg} text-white text-[10px] font-black px-2.5 py-1 uppercase tracking-widest rounded-lg`}>SECTION {sectionNum}</span>
                        <span className={`text-[10px] font-bold ${pal.text}`}>{sectionAnswered}/{sqs.length}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 px-4 py-3">
                      {sqs.map(({ q, idx }) => {
                        const ans = answers[String(q.id)];
                        const isAnswered = !!(ans && ans.trim());
                        const isCurrent = idx === currentIndex;
                        return (
                          <button key={q.id} onClick={() => { navigateTo(idx); setShowNav(false); }} className={`aspect-square text-[11px] font-bold transition-all border flex items-center justify-center ${isCurrent ? `ring-2 ring-offset-1 ${pal.ring}` : ""} ${isAnswered ? pal.navAnswered : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100"}`}>
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-stone-200">
              <button onClick={() => { setShowNav(false); handleSubmit(); }} className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold uppercase tracking-widest text-xs h-11 transition-colors rounded-xl">Submit Exam</button>
            </div>
          </div>
        </div>
      )}

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-28 pt-3 relative">
        <div className="w-full px-3 sm:px-6">
          {sectionTransition !== null && (
            <SectionTransitionBanner section={sectionTransition} description={sectionDescriptions[String(sectionTransition)]} onDone={() => setSectionTransition(null)} palette={getSectionPalette(sectionTransition)} />
          )}

          {sectionExpired && !sectionAutoAdvance && (() => {
            const sections = sectionGroups.map(([s]) => s).sort((a, b) => a - b);
            const nextSection = sections.find((s) => s > currentSectionNum);
            if (!nextSection) return null;
            return (
              <div className="mb-3 bg-rose-50 border border-rose-200 px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex-1">
                  <p className="text-rose-800 text-xs font-bold uppercase tracking-tight">Section {currentSectionNum} Expired</p>
                  <p className="text-rose-600 text-[10px] mt-0.5 uppercase">Please advance to the next section.</p>
                </div>
                <button
                  onClick={() => {
                    if (sectionAdvancing.current) return;
                    sectionAdvancing.current = true;
                    api.student.advanceSection().then((res) => {
                      setCurrentSectionNum(res.current_section);
                      setSectionStartTime(res.section_start_time);
                      setSectionExpired(false);
                      const newGroup = sectionGroups.find(([s]) => s === res.current_section);
                      if (newGroup) {
                        const firstIdx = newGroup[1].questions[0]?.idx;
                        if (firstIdx != null) navigateTo(firstIdx);
                      }
                      setSectionTransition(res.current_section);
                    }).finally(() => { sectionAdvancing.current = false; });
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors active:scale-95"
                >
                  Next Section →
                </button>
              </div>
            );
          })()}

          {current && (
            <div className="bg-white border border-stone-200 shadow-sm overflow-hidden rounded-2xl relative z-10">
              <div className={`${palette.light} border-b ${palette.border} px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1`} dir="ltr">
                <span className={`${palette.bg} text-white text-[9px] font-black px-2.5 py-1 uppercase tracking-widest flex-shrink-0 rounded-lg`}>SECTION {current.section}</span>
                <span className={`${palette.text} text-[10px] font-black uppercase tracking-widest`}>{TYPE_LABEL[current.type]}</span>
                <span className="text-stone-300 text-xs">·</span>
                <span className={`${palette.text} text-[10px] font-black uppercase tracking-widest`}>{current.marks} {current.marks === 1 ? 'Mark' : 'Marks'}</span>
                {posInSection > 0 && <span className="text-stone-400 text-[10px] ml-auto font-black">{posInSection} / {totalInSection}</span>}
              </div>

              <div className="p-5 sm:p-10">
                <QuestionCard
                  question={current}
                  answer={answers[String(current.id)] || ""}
                  onAnswer={handleAnswer}
                  lang={lang}
                  palette={palette}
                  fontSizeMultiplier={fontSize}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-stone-200 px-4 py-3 sm:py-4 z-40 shadow-[0_-8px_30px_rgb(0,0,0,0.08)]">
        <div className="flex gap-4 max-w-2xl mx-auto">
          <button 
            onClick={() => navigateTo(Math.max(0, currentIndex - 1))} 
            disabled={currentIndex === 0} 
            className="h-14 w-14 sm:w-16 flex-shrink-0 border-2 border-stone-200 rounded-xl disabled:opacity-30 text-stone-600 hover:bg-stone-50 active:scale-95 transition-all flex items-center justify-center bg-white"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          
          <div className="flex-1">
            {currentIndex < questions.length - 1 ? (
              <button 
                onClick={() => navigateTo(currentIndex + 1)} 
                className="w-full h-14 bg-brand-800 hover:bg-brand-900 text-white font-black uppercase tracking-[0.15em] text-[11px] transition-all shadow-lg shadow-brand-900/10 flex items-center justify-center gap-2 active:scale-[0.98] rounded-xl"
              >
                {posInSection === totalInSection ? "Next Section" : "Next Question"}
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={() => handleSubmit()} 
                className="w-full h-14 bg-teal-700 hover:bg-teal-800 text-white font-black uppercase tracking-[0.15em] text-[11px] transition-all shadow-lg shadow-teal-900/10 active:scale-[0.98] rounded-xl"
              >
                Finish & Submit Exam
              </button>
            )}
            <div className="h-1 bg-stone-100 mt-2 w-full">
              <div className="h-full bg-brand-500 transition-all opacity-20" style={{ width: `${(currentIndex / questions.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <Watermark rollNumber={student.roll_number} />
      {strike && <StrikeWarning count={strike.count} event={strike.event} onDismiss={() => setStrike(null)} onRequestFullscreen={requestFullscreen} />}
      {showSubmit && (
        <SubmitModal
          answeredCount={answeredCount}
          totalCount={questions.length}
          onConfirm={() => handleSubmit(true)}
          onCancel={() => {
            setShowSubmit(false);
            setSubmitError(null);
          }}
          loading={loading}
          error={submitError}
        />
      )}
    </div>
  );
}
