
const BASE = import.meta.env.PROD 
  ? 'https://aljamia-admission-exam.fly.dev/api' 
  : '/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
    } catch { }
    throw new ApiError(res.status, detail)
  }

  return res.json() as Promise<T>
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    let detail = `Upload Failed (${res.status})`
    try {
      const err = await res.json()
      detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
    } catch { }
    throw new ApiError(res.status, detail)
  }

  return res.json() as Promise<T>
}

// ── API Definition ──────────────────────────────────────────────────────────

export const api = {
  // ── Student Endpoints ─────────────────────────────────────────────────────
  student: {
    login: (roll_number: string, password: string) =>
      request<{ token: string; student: import('../types').Student }>(
        'POST', '/students/login', { roll_number, password }, false
      ),

    publicConfig: (exam_code = 'DEFAULT') =>
      request<{
        exam_start_time: string | null
        exam_duration_minutes: number
        section_durations: Record<string, number>
        section_auto_advance: boolean
        test_mode: boolean
        grace_minutes: number
        login_deadline: string | null
      }>('GET', `/students/config/public?exam_code=${exam_code}`, undefined, false),

    startExam: () =>
      request<{
        started: boolean
        resume: boolean
        question_count: number
        questions: import('../types').Question[]
        duration_minutes: number
        section_durations?: Record<string, number>
        section_descriptions?: Record<string, string>
        section_auto_advance?: boolean
      }>('POST', '/exam/start'),

    getQuestions: () =>
      request<{
        questions: import('../types').Question[]
        answers: Record<string, string>
        start_time: string | null
        duration_minutes: number
        status: string
        current_section: number
        section_start_time: string | null
        section_durations: Record<string, number>
        section_descriptions: Record<string, string>
        section_auto_advance: boolean
      }>('GET', '/exam/questions'),

    saveAnswer: (question_id: number, answer: string) =>
      request<{ saved: boolean }>('POST', '/exam/answer', { question_id, answer }),

    submit: () =>
      request<{ submitted: boolean; score: number }>('POST', '/exam/submit'),

    bulkReset: (rolls: string[]) =>
      request<{ reset: boolean }>('POST', '/exam/bulk-reset', { rolls }),

    strike: (event: string) =>
      request<{ strikes: number; status: string }>('POST', '/exam/strike', { event }),

    advanceSection: () =>
      request<{ current_section: number; section_start_time: string }>('POST', '/exam/section/next'),
  },

  // ── Admin Endpoints ───────────────────────────────────────────────────────
  admin: {
    login: (username: string, password: string) =>
      request<{ token: string; role: string; centre_id: number; username: string }>(
        'POST', '/admin/login', { username, password }, false,
      ),

    getStudents: (exam_id?: number) => {
      const q = exam_id != null ? `?exam_id=${exam_id}` : ''
      return request<import('../types').AdminStudent[]>('GET', `/admin/students${q}`)
    },

    importStudents: (students: unknown[], year: string, exam_id?: number) =>
      request<{ imported: number; errors: unknown[]; students: unknown[] }>(
        'POST', '/admin/import', { students, year, exam_id },
      ),

    createStudent: (data: {
      name_en: string; dob: string; phone: string;
      stream?: string; course?: string; name_ar?: string;
      email?: string; centre_id?: number; paper_set?: string; exam_id?: number;
    }) =>
      request<{ roll_number: string; password: string; name_en: string; paper_set: string }>(
        'POST', '/admin/students', data,
      ),

    exportResults: (exam_id?: number) => {
      const q = exam_id != null ? `?exam_id=${exam_id}` : ''
      return request<unknown[]>('GET', `/admin/results/export${q}`)
    },

    getCentres: () =>
      request<import('../types').Centre[]>('GET', '/admin/centres'),

    createCentre: (data: { name_en: string; name_ar?: string; wifi_ssid?: string; allowed_ip_ranges?: string[] }) =>
      request<{ id: number }>('POST', '/admin/centres', data),

    updateCentre: (id: number, data: { name_en: string; name_ar?: string; wifi_ssid?: string; allowed_ip_ranges?: string[] }) =>
      request<{ updated: boolean }>('PUT', `/admin/centres/${id}`, data),

    deleteCentre: (id: number) =>
      request<{ deleted: boolean }>('DELETE', `/admin/centres/${id}`),

    createAdmin: (data: { username: string; password: string; role: string; centre_id?: number }) =>
      request<{ created: boolean }>('POST', '/admin/admins', data),

    resetStudent: (roll: string) =>
      request<{ reset: boolean }>('POST', `/admin/students/${roll}/reset`),

    reopenStudent: (roll: string) =>
      request<{ reopened: boolean }>('POST', `/admin/students/${roll}/reopen`),

    deleteStudent: (roll: string) =>
      request<{ deleted: boolean }>('DELETE', `/admin/students/${roll}`),

    gradeStudent: (roll: string, score: number) =>
      request<{ updated: boolean }>('POST', `/admin/students/${roll}/grade`, { score }),

    assignExam: (roll: string, exam_id: number) =>
      request<{ assigned: boolean; exam_id: number }>('POST', `/admin/students/${roll}/assign-exam`, { exam_id }),

    getPassword: (roll: string) =>
      request<{ password: string }>('GET', `/admin/students/${roll}/password`),

    updateStudent: (roll: string, data: Partial<import('../types').AdminStudent>) =>
      request<{ updated: boolean; roll_number: string }>('PUT', `/admin/students/${roll}`, data),

    answerTimeline: (roll: string) =>
      request<{
        start_time: string | null;
        answers: { question_id: number; section: number; question_number: number; type: string; answer: string; answered_at: string }[]
      }>('GET', `/admin/students/${roll}/answer-timeline`),

    studentView: (roll: string) =>
      request<{
        questions: import('../types').Question[]
      }>('GET', `/exam/admin/student-view/${roll}`),

    getStreams: () =>
      request<import('../types').StreamDef[]>('GET', '/admin/streams'),

    createStream: (name: string) =>
      request<import('../types').StreamDef>('POST', '/admin/streams', { name }),

    updateStream: (id: number, name: string) =>
      request<import('../types').StreamDef>('PUT', `/admin/streams/${id}`, { name }),

    deleteStream: (id: number) =>
      request<{ deleted: boolean }>('DELETE', `/admin/streams/${id}`),

    getSets: () =>
      request<import('../types').StreamDef[]>('GET', '/admin/sets'),

    createSet: (name: string) =>
      request<import('../types').StreamDef>('POST', '/admin/sets', { name }),

    updateSet: (id: number, name: string) =>
      request<import('../types').StreamDef>('PUT', `/admin/sets/${id}`, { name }),

    deleteSet: (id: number) =>
      request<{ deleted: boolean }>('DELETE', `/admin/sets/${id}`),
  },

  // ── Question Management ───────────────────────────────────────────────────
  questions: {
    list: (params?: { paper_set?: string; section?: number; stream?: string }) => {
      const qs = new URLSearchParams()
      if (params?.paper_set) qs.set('paper_set', params.paper_set)
      if (params?.section !== undefined) qs.set('section', String(params.section))
      if (params?.stream) qs.set('stream', params.stream)
      const query = qs.toString()
      return request<import('../types').QuestionRow[]>('GET', `/questions${query ? '?' + query : ''}`)
    },

    create: (data: Partial<import('../types').QuestionRow> & { paper_set: string }) =>
      request<{ id: number }>('POST', '/questions', data),

    update: (id: number, data: Partial<import('../types').QuestionRow>) =>
      request<{ updated: boolean }>('PUT', `/questions/${id}`, data),

    delete: (id: number) =>
      request<{ deleted: boolean }>('DELETE', `/questions/${id}`),

    createBulk: (questions: Partial<import('../types').QuestionRow>[]) =>
      request<{ inserted: number; errors: unknown[] }>('POST', '/questions/bulk', questions),

    parseFromImage: (formData: FormData) =>
      upload<{ questions: import('../types').QuestionRow[]; count: number }>(
        '/questions/extract', formData
      ),
  },

  // ── Legacy config (backward compat) ──────────────────────────────────────
  config: {
    get: () => request<import('../types').ExamConfig>('GET', '/config'),
    update: (data: Partial<import('../types').ExamConfig>) =>
      request<{ updated: boolean }>('PUT', '/config', data),
  },

  // ── App Settings ─────────────────────────────────────────────────────────
  settings: {
    get: () => request<import('../types').AppSettings>('GET', '/settings'),
    update: (data: Partial<import('../types').AppSettings>) =>
      request<{ updated: boolean }>('PUT', '/settings', data),
  },

  // ── Exams (v2 multi-exam) ─────────────────────────────────────────────────
  exams: {
    list: () =>
      request<import('../types').Exam[]>('GET', '/exams'),

    get: (id: number) =>
      request<import('../types').Exam>('GET', `/exams/${id}`),

    create: (data: Partial<import('../types').Exam>) =>
      request<{ id: number; code: string }>('POST', '/exams', data),

    update: (id: number, data: Partial<import('../types').Exam>) =>
      request<{ updated: boolean }>('PUT', `/exams/${id}`, data),

    delete: (id: number) =>
      request<{ deleted: boolean }>('DELETE', `/exams/${id}`),

    publish: (id: number, results_publish_time?: string, reset_notifications = false) =>
      request<{ published: boolean; publish_time: string }>(
        'POST', `/exams/${id}/publish`,
        { results_publish_time, reset_notifications },
      ),

    publicResults: (id: number) =>
      request<import('../types').PublicExamResult>('GET', `/exams/${id}/results/public`, undefined, false),

    listPublished: () =>
      request<{ id: number; name: string; name_ar: string; code: string; published_at: string }[]>(
        'GET', '/exams/public/list', undefined, false,
      ),
  },
}
