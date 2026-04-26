import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Question } from '../types'

interface ExamState {
  questions: Question[]
  answers: Record<string, string>
  currentIndex: number
  startTime: Date | null
  durationMinutes: number
  strikes: number
  status: string
  sectionDescriptions: Record<string, string>
  timeLeft: number | null
  initializeExam: (data: any) => void
  setQuestions: (qs: Question[], answers?: Record<string, string>) => void
  setAnswer: (questionId: number, answer: string) => void
  setCurrentIndex: (i: number) => void
  setStartTime: (t: Date) => void
  setDuration: (m: number) => void
  addStrike: (count: number, status: string) => void
  setStatus: (s: string) => void
  setSectionDescriptions: (descriptions: Record<string, string>) => void
  reset: () => void
}

export const useExamStore = create<ExamState>()(persist((set) => ({
  questions: [],
  answers: {},
  currentIndex: 0,
  startTime: null,
  durationMinutes: 180,
  strikes: 0,
  status: 'pending',
  sectionDescriptions: {},
  timeLeft: null,

  // 1. Bulk initializer to prevent race conditions
  initializeExam: (data: any) => set((state) => {
    const serverNow = data.server_now ? new Date(data.server_now).getTime() : Date.now();
    const startTime = data.start_time ? new Date(data.start_time).getTime() : serverNow;
    const totalMs = (data.duration_minutes || state.durationMinutes) * 60000;
    const elapsed = serverNow - startTime;
    const timeLeft = Math.max(0, totalMs - elapsed);

    return {
      ...state,
      questions: data.questions || [],
      answers: data.answers || {},
      durationMinutes: data.duration_minutes || state.durationMinutes,
      sectionDescriptions: data.section_descriptions || {},
      status: data.status || 'active',
      startTime: data.start_time ? new Date(data.start_time) : (state.startTime || new Date()),
      timeLeft,
    };
  }),

  // 2. Fix setQuestions to be a merge, not a replacement
  setQuestions: (qs, answers = {}) => 
    set((s) => ({ ...s, questions: qs, answers: { ...s.answers, ...answers } })),

  setAnswer: (qId, answer) =>
    set((s) => ({ answers: { ...s.answers, [String(qId)]: answer } })),
  
  setCurrentIndex: (i) => set({ currentIndex: i }),
  setStartTime: (t) => set({ startTime: t }),
  setDuration: (m) => set({ durationMinutes: m }),
  addStrike: (count, status) => set({ strikes: count, status }),
  setStatus: (s) => set({ status: s }),
  setSectionDescriptions: (descriptions) => set({ sectionDescriptions: descriptions }),
  
  reset: () => {
    localStorage.removeItem('exam-store')
    set({
      questions: [],
      answers: {},
      currentIndex: 0,
      startTime: null,
      durationMinutes: 180,
      strikes: 0,
      status: 'pending',
      sectionDescriptions: {},
    })
  },
}), {
  name: 'exam-store',
  storage: createJSONStorage(() => localStorage),
  // Only persist exam progress — not ephemeral state like strikes/status
  partialize: (state) => ({
    questions: state.questions,
    answers: state.answers,
    currentIndex: state.currentIndex,
    startTime: state.startTime,
    durationMinutes: state.durationMinutes,
    sectionDescriptions: state.sectionDescriptions,
  }),
}))