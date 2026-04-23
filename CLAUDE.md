Comprehensive Codebase Analysis: ALJ Examination System

       1. What Kind of Application This Is

       This is a real-time, proctored online admission examination platform named "ALJ Examination System" (branded as "Aljamia Admission Exam" in deployment config). It is built to support large-scale concurrent exams (up to 1000 simultaneous students) across multiple physical exam centres. The system
       is designed specifically around trust and anti-cheating — it goes to considerable lengths to prevent candidates from sharing answers or cheating during the exam.

       ---
       2. User Roles

       There are three distinct roles, enforced in both the backend (/home/aathif/Projects/exam/api/auth.py) and database schema (/home/aathif/Projects/exam/api/schema.sql):

       ┌─────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
       │        Role         │                                                                        Description                                                                         │
       ├─────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
       │ student             │ Exam taker. Logs in with roll number (phone number) + a password announced on exam day.                                                                    │
       ├─────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
       │ invigilator         │ Can monitor students at their assigned centre only. Cannot access import, questions, config, or results tabs.                                              │
       ├─────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
       │ admin (super-admin) │ Full access to all features: import students, manage questions, configure exams, view results, manage centres and create other admin/invigilator accounts. │
       └─────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

       ---
       3. Key Features and Functionality

       Student-Facing:
       - Pre-exam countdown timer on the login screen
       - Exam starts only after the scheduled exam_start_time
       - Questions served in a randomized order (shuffled per student, seeded by roll number)
       - MCQ option order is also shuffled per-student (so two students see options in different order)
       - Questions watermarked with invisible zero-width Unicode characters (adversarial noise) — unique per student so screenshots can be traced back to the source
       - Bilingual support: English and Arabic, with RTL rendering for Arabic
       - Live answer auto-saving (each answer triggers a POST /exam/answer)
       - Countdown timer during the exam; auto-submits on expiry
       - A "section transition banner" appears when moving between sections
       - Post-submission confirmation screen (/submitted)

       Anti-Cheat System (enforced client-side, reported to server):
       All violations are tracked as "strikes" and broadcast to the admin dashboard via WebSocket:
       1. Tab switching / window visibility change
       2. Window blur (switching to another app)
       3. Fullscreen exit (fullscreen is enforced)
       4. DevTools detection (window size heuristic, checked every 3 seconds)
       5. Keyboard shortcut blocking (F12, Ctrl+T/W/N/Tab/U/P, Alt+Tab, Meta+T/W/N)
       6. Right-click disabled
       7. Copy/cut disabled (except inside answer textarea/input fields)
       8. 3 strikes = automatically flagged and force-submitted with current answers
       9. Optional server-side WiFi IP subnet check (CIDR ranges per centre)

       Admin-Facing (Dashboard tabs):
       - Monitor tab: Live grid/list view of all students, showing status (pending/active/submitted/flagged), answers progress, strikes, current question being viewed, disconnect events, exam countdown banner
       - Import tab: Upload student data from Excel; auto-generates roll numbers (from phone) and passwords (DOB + last 4 digits of phone); balanced Paper Set A/B assignment
       - Questions tab: CRUD for exam questions by paper set, section, stream; bulk import via JSON; OCR image extraction via Tesseract (upload an image of a question paper to auto-parse MCQs in English or Arabic)
       - Config tab: Set exam start time, duration, IP restriction toggle, allowed IP CIDR ranges, test mode (bypasses time/IP checks)
       - Results tab: Score leaderboard with band distribution (0-29, 30-49, 50-69, 70-89, 90-100), sortable table, CSV export
       - Centres tab: Manage exam centres (English + Arabic names, WiFi SSID, IP ranges)
       - Student Detail Modal: Per-student answer timeline (timestamp of each answer), strike log, ability to reset or delete a student, view/retrieve forgotten password

       Real-time WebSocket Features:
       - /ws/dashboard — Admin receives live events: answer_saved, strike, submitted, status_change, student_viewing (which question they're on), student_disconnect (with reason code)
       - /ws/student — Student sends viewing (current question index) and screenshot (base64 JPEG). Admins can subscribe to a specific student's live screenshots
       - Activity feed: last 200 events kept in memory for the Monitor tab

       ---
       4. Tech Stack

       Backend:
       - Language: Python 3.12
       - Framework: FastAPI with uvicorn (2 workers in production)
       - Database: PostgreSQL (async via asyncpg)
       - Auth: JWT tokens (HS256) via python-jose; password hashing via passlib (Argon2/bcrypt)
       - AI integration: anthropic SDK (dependency present, not visibly used in active routes)
       - OCR: pytesseract + Pillow (for question extraction from images)
       - Serialization: orjson for fast JSON responses
       - Load testing: locust
       - Deployment: Docker on Fly.io (Singapore region), targeting Neon PostgreSQL

       Frontend:
       - Framework: React 18 + TypeScript
       - Routing: React Router v6
       - State management: Zustand (with persist middleware for auth)
       - Build tool: Vite 5
       - Styling: Tailwind CSS v3
       - Icons: Lucide React
       - Image capture: html-to-image (for student screenshots)
       - No Redux, no query library — plain fetch calls via /home/aathif/Projects/exam/frontend/src/api/client.ts

       ---
       5. Main Pages / Routes / Screens

       ┌──────────────────┬───────────────┬───────────────────────────────────┐
       │       Path       │   Component   │            Description            │
       ├──────────────────┼───────────────┼───────────────────────────────────┤
       │ /                │ StudentLogin  │ Student login with exam countdown │
       ├──────────────────┼───────────────┼───────────────────────────────────┤
       │ /exam            │ ExamPage      │ The exam itself (protected)       │
       ├──────────────────┼───────────────┼───────────────────────────────────┤
       │ /submitted       │ Submitted     │ Post-submission confirmation      │
       ├──────────────────┼───────────────┼───────────────────────────────────┤
       │ /admin           │ AdminLogin    │ Admin/invigilator login           │
       ├──────────────────┼───────────────┼───────────────────────────────────┤
       │ /admin/dashboard │ Dashboard     │ Full admin dashboard (protected)  │
       ├──────────────────┼───────────────┼───────────────────────────────────┤
       │ *                │ Redirect to / │ Catch-all                         │
       └──────────────────┴───────────────┴───────────────────────────────────┘

       ---
       6. Core Workflows

       Workflow A: Student Takes the Exam
       1. Student visits / — login page fetches GET /api/students/config/public to show countdown or "open" banner
       2. Student logs in with roll number (phone number) + password (POST /api/students/login) — server checks timing, returns JWT
       3. Frontend stores token in localStorage (via Zustand persist), navigates to /exam
       4. ExamPage calls POST /api/exam/start — server runs start_student_exam() DB stored procedure, which shuffles question IDs per student, marks status as active, returns question list with adversarial noise injected and options shuffled
       5. Student answers questions one at a time; each answer fires POST /api/exam/answer immediately (no buffering) — saved to student_answers table and broadcast to admins
       6. WebSocket to /ws/student sends viewing events (which question) and periodic screenshot frames
       7. Anti-cheat hook monitors browser events; violations call POST /api/exam/strike; at 3 strikes the server auto-submits and broadcasts
       8. On manual submit (or timer expiry): POST /api/exam/submit — server calculates score (accounts for per-student option shuffling via inverse remap), updates status to submitted, broadcasts to dashboard
       9. Student sees /submitted page

       Workflow B: Admin Sets Up an Exam
       1. Admin logs in at /admin (POST /api/admin/login), gets 8-hour JWT
       2. Goes to Centres tab: creates exam centres with names (EN + AR), WiFi SSID, IP ranges
       3. Goes to Import tab: uploads Excel file → parsed client-side → sent to POST /api/admin/import → roll numbers and passwords auto-generated, paper sets balanced A/B
       4. Goes to Questions tab: manually creates questions or bulk-imports JSON; can use OCR to upload a photo of a printed question paper
       5. Goes to Config tab: sets exam_start_time, duration, enables/disables IP check, sets test mode
       6. On exam day: shares password format with invigilators (e.g. DDMMYYYY_last4phone) — students derive their own password from public information

       Workflow C: Admin Monitors a Live Exam
       1. Monitor tab connects to /ws/dashboard WebSocket
       2. Receives real-time events: students starting, answering, submitting, strikes
       3. Can toggle Grid/List view; filter by centre or status
       4. Exam countdown banner shows time remaining
       5. Can click any student to open StudentDetailModal: see answer timeline, strike log, retrieve password, reset or delete the student
       6. Can "watch" a specific student to receive live screenshot frames

       Workflow D: Post-Exam Results
       1. Results tab shows submitted students with scores
       2. Score band distribution chart (5 bands)
       3. Sortable leaderboard with search/filter
       4. CSV export of all results
       5. GET /api/admin/results/export returns full data including answers and strike logs

       ---
       Key Files Reference

       - /home/aathif/Projects/exam/api/main.py — FastAPI app assembly and static file serving
       - /home/aathif/Projects/exam/api/schema.sql — full DB schema (6 tables)
       - /home/aathif/Projects/exam/api/auth.py — JWT and password utilities
       - /home/aathif/Projects/exam/api/routers/exam.py — student exam flow (start, questions, answer, submit, strike)
       - /home/aathif/Projects/exam/api/routers/admin.py — admin CRUD (students, centres, import, results)
       - /home/aathif/Projects/exam/api/routers/questions.py — question CRUD + OCR extraction
       - /home/aathif/Projects/exam/api/routers/ws.py — WebSocket hub (dashboard + student channels, screenshot relay)
       - /home/aathif/Projects/exam/api/routers/config.py — exam config get/update
       - /home/aathif/Projects/exam/frontend/src/App.tsx — route definitions
       - /home/aathif/Projects/exam/frontend/src/pages/student/ExamPage.tsx — main exam UI
       - /home/aathif/Projects/exam/frontend/src/pages/admin/Dashboard.tsx — admin dashboard shell
       - /home/aathif/Projects/exam/frontend/src/hooks/useAntiCheat.ts — all client-side proctoring
       - /home/aathif/Projects/exam/frontend/src/api/client.ts — complete typed API client
       - /home/aathif/Projects/exam/frontend/src/types/index.ts — shared TypeScript types