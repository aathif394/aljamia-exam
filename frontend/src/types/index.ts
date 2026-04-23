export type QuestionType = 'mcq' | 'true_false' | 'fill_blank' | 'descriptive'
export type Language = 'en' | 'ar' | 'both'
export type ExamStatus = 'pending' | 'active' | 'submitted' | 'flagged'
export type UserRole = 'admin' | 'invigilator'
export type Stream = string

export interface StreamDef {
  id: number
  name: string
}
export type ExamLifecycle = 'draft' | 'active' | 'completed' | 'archived'

export interface Question {
  id: number
  section: number
  question_number: number
  display_number: number
  type: QuestionType
  language: Language
  question_en: string
  question_ar: string
  options_en: string[]
  options_ar: string[]
  marks: number
  stream: string | null
}

export interface Student {
  roll_number: string
  name_en: string
  name_ar: string
  stream: Stream
  course: string
  dob: string
  phone: string
  email: string
  centre_id: number
  paper_set: string
  status: ExamStatus
  exam_id?: number
  exam_name?: string
}

export interface AdminStudent extends Student {
  id: number
  strikes: number
  score: number
  start_time: string | null
  submit_time: string | null
  centre_name: string
  answered_count: number
  total_questions: number
  strike_log: StrikeEvent[]
  answers: Record<string, string>
  question_order?: number[]
}

export interface StrikeEvent {
  time: string
  event: string
}

/** Per-exam configuration (replaces singleton ExamConfig) */
export interface Exam {
  id: number
  name: string
  name_ar: string
  code: string
  exam_start_time: string | null
  exam_duration_minutes: number
  grace_minutes: number        // minutes after start_time during which students can still log in (0 = no limit)
  pass_mark: number            // minimum score to be considered passing (0 = no pass mark)
  ip_restriction: boolean
  allowed_ip_ranges: string[]
  test_mode: boolean
  results_publish_time: string | null
  section_durations: Record<string, number>   // {"1": 20, "2": 15}  — 0 = unlimited
  section_descriptions: Record<string, string>  // {"1": "Read instructions...", "2": "Answer in Arabic"}
  section_auto_advance: boolean
  shuffle_questions: boolean
  notify_email: boolean
  notify_sms: boolean
  notifications_sent: boolean
  status: ExamLifecycle
  student_count?: number
  active_count?: number
  submitted_count?: number
  created_at?: string
  updated_at?: string
}

export interface AppSettings {
  resend_api_key: string | null
  resend_from_email: string
  resend_from_name: string
}

/** Legacy singleton config shape — kept for backward compat with ConfigTab */
export interface ExamConfig {
  exam_start_time: string | null
  exam_duration_minutes: number
  password_format: string
  allowed_ip_ranges: string[]
  enable_ip_check: boolean
  test_mode: boolean
  // v2 additions
  results_publish_time?: string | null
  section_durations?: Record<string, number>
  section_auto_advance?: boolean
  notify_email?: boolean
  notify_sms?: boolean
}

export interface Centre {
  id: number
  name_en: string
  name_ar: string
  wifi_ssid: string
  allowed_ip_ranges?: string[]
}

export interface QuestionRow {
  id: number
  paper_set: string
  section: number
  question_number: number
  type: QuestionType
  language: Language
  question_en: string
  question_ar: string
  options_en: string[]
  options_ar: string[]
  correct_answer: string
  marks: number
  stream: string | null
}

export interface PublicExamResult {
  exam_name: string
  published_at: string
  results: {
    rank: number
    roll_number: string
    name_en: string
    name_ar: string
    stream: string
    course: string
    paper_set: string
    score: number
    centre_name: string
    submit_time: string | null
  }[]
}
