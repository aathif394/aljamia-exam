import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Student } from '../types'
import { useExamStore } from './examStore'

interface StudentAuth {
  token: string
  student: Student
}

interface AdminAuth {
  token: string
  role: string
  centre_id: number
  username: string
}

interface AuthState {
  studentAuth: StudentAuth | null
  adminAuth: AdminAuth | null
  setStudentAuth: (auth: StudentAuth) => void
  setAdminAuth: (auth: AdminAuth) => void
  clearStudent: () => void
  clearAdmin: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      studentAuth: null,
      adminAuth: null,
      setStudentAuth: (auth) => {
        localStorage.setItem('token', auth.token)
        set({ studentAuth: auth })
      },
      setAdminAuth: (auth) => {
        localStorage.setItem('token', auth.token)
        set({ adminAuth: auth })
      },
      clearStudent: () => {
        localStorage.removeItem('token')
        useExamStore.getState().reset()
        set({ studentAuth: null })
      },
      clearAdmin: () => {
        localStorage.removeItem('token')
        set({ adminAuth: null })
      },
    }),
    {
      name: 'exam-auth',
      partialize: (s) => ({ studentAuth: s.studentAuth, adminAuth: s.adminAuth }),
    },
  ),
)
