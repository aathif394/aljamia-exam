import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import StudentLogin from './pages/student/StudentLogin'
import ExamPage from './pages/student/ExamPage'
import Submitted from './pages/student/Submitted'
import Results from './pages/student/Results'
import AdminLogin from './pages/admin/AdminLogin'
import Dashboard from './pages/admin/Dashboard'
import { useAuthStore } from './stores/authStore'
import { ExamErrorBoundary } from './pages/student/components/ExamErrorBoundary'

function RequireStudent({ children }: { children: React.ReactNode }) {
  const student = useAuthStore((s) => s.studentAuth)
  return student ? <>{children}</> : <Navigate to="/" replace />
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const admin = useAuthStore((s) => s.adminAuth)
  return admin ? <>{children}</> : <Navigate to="/admin" replace />
}

function RequireNoAdmin({ children }: { children: React.ReactNode }) {
  const admin = useAuthStore((s) => s.adminAuth)
  return admin ? <Navigate to="/admin/dashboard" replace /> : <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Student routes */}
        <Route path="/" element={<StudentLogin />} />
        <Route path="/exam" element={<RequireStudent><ExamErrorBoundary><ExamPage /></ExamErrorBoundary></RequireStudent>} />
        <Route path="/submitted" element={<RequireStudent><Submitted /></RequireStudent>} />
        <Route path="/results" element={<Results />} />

        {/* Admin routes */}
        <Route path="/admin" element={<RequireNoAdmin><AdminLogin /></RequireNoAdmin>} />
        <Route path="/admin/dashboard" element={<RequireAdmin><Dashboard /></RequireAdmin>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
