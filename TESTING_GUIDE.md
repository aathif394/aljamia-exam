# ALJ Examination System — Tester Guide

**Version:** UAT-1  
**Date:** April 2026  
**Prepared for:** External QA Testers

---

## Overview

The ALJ Examination System is a real-time, proctored online admission examination platform. It supports two primary roles you will be testing:

- **Admin** — Sets up the exam, imports students, manages questions, monitors live sessions, and reviews results.
- **Student** — Logs in, takes the exam under proctoring conditions, and submits answers.

This document tells you **what to test**, **how to test it**, and **what a pass or fail looks like** for each feature.

---

## Before You Begin

### What You Need

| Item | Details |
|---|---|
| Admin credentials | Will be provided separately |
| Student test credentials | You will create these during admin setup, or they will be pre-loaded |
| Two devices or browser profiles | One for admin, one for student — do not mix sessions |
| A desktop/laptop browser | Chrome or Firefox (latest). Do not use mobile for the exam itself |
| Stable internet connection | Required for WebSocket real-time features |

### Environment

- All testing is on the **deployed staging environment** — URL will be provided separately.
- Do **not** use production data or real student information.
- Use test mode in Config to bypass the exam schedule during testing (see Admin setup steps).

### Reporting Bugs

For each bug found, record:
1. **Steps to reproduce** (numbered, exact)
2. **Expected result**
3. **Actual result**
4. **Screenshot or screen recording**
5. **Browser and OS**
6. **Role at the time** (Admin / Student)

---

## Part 1: Admin End-to-End Testing

**Login URL:** `/admin`

---

### A1 — Admin Login

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| A1.1 | Go to `/admin` | Admin login form appears with username and password fields | |
| A1.2 | Submit with empty fields | Validation error shown, no login | |
| A1.3 | Submit with wrong password | Error message shown ("Invalid credentials" or similar) | |
| A1.4 | Submit with correct credentials | Redirected to admin dashboard | |
| A1.5 | Reload page after login | Still logged in (session persists) | |
| A1.6 | Log out (if logout button exists) | Redirected back to login, cannot access dashboard | |

---

### A2 — Exam Configuration (Config Tab)

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| A2.1 | Open **Config** tab | Shows fields: exam start time, duration, IP restriction toggle, IP ranges, test mode toggle | |
| A2.2 | Enable **Test Mode** | Toggle turns on; save succeeds | |
| A2.3 | Set exam duration to 60 minutes | Saves successfully | |
| A2.4 | Set exam start time to a future date/time | Saves successfully | |
| A2.5 | Set exam start time to a past date/time | Saves successfully (test mode bypasses this) | |
| A2.6 | Toggle IP restriction ON and enter a CIDR range (e.g. `192.168.1.0/24`) | Saves successfully | |
| A2.7 | Toggle IP restriction OFF | Saves successfully; IP field greys out or becomes irrelevant | |

> **Note:** Keep **Test Mode ON** for all other testing so you are not blocked by the exam schedule.

---

### A3 — Centre Management (Centres Tab)

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| A3.1 | Open **Centres** tab | Shows list of existing centres (or empty state) | |
| A3.2 | Create a new centre with English name, Arabic name, and a WiFi SSID | Centre appears in the list | |
| A3.3 | Edit the centre — change the English name | Change reflected in the list | |
| A3.4 | Add IP ranges to the centre | Saves successfully | |
| A3.5 | Delete the centre | Centre removed from list | |
| A3.6 | Create at least **two** centres for later use | Both appear in the list | |

---

### A4 — Student Import (Import Tab)

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| A4.1 | Open **Import** tab | Shows file upload area and instructions | |
| A4.2 | Upload the provided **valid test Excel file** | Students parsed and shown in preview table before import | |
| A4.3 | Confirm import | Students saved; success message shown with count | |
| A4.4 | Check that roll numbers are generated (should be the student's phone number) | Roll numbers visible in preview or confirmed in success message | |
| A4.5 | Upload the same file again | Either blocks duplicate import or handles gracefully with a message | |
| A4.6 | Upload an **invalid/empty Excel file** | Error shown; no students imported | |
| A4.7 | Check that students are split between Paper Set A and Paper Set B roughly 50/50 | Balanced distribution visible | |

> **Test Excel format:** The file must have columns for student name, phone number, date of birth, and centre. A sample file will be provided.

---

### A5 — Question Management (Questions Tab)

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| A5.1 | Open **Questions** tab | Shows list of questions, filters by paper set/section/stream | |
| A5.2 | Create a new question manually: question text, 4 options, mark the correct option, assign to Paper Set A, Section 1 | Question appears in the list | |
| A5.3 | Edit the question — change the question text | Updated text appears in list | |
| A5.4 | Create a second question for Paper Set B | Appears under Set B | |
| A5.5 | Delete a question | Removed from list | |
| A5.6 | Use the **bulk JSON import** feature with provided sample JSON | Questions imported; count shown | |
| A5.7 | *(Optional)* Use the **OCR image upload** — upload a photo of text with MCQ questions | System attempts to extract questions; review parsed output for accuracy | |

---

### A6 — Live Monitoring (Monitor Tab)

> This section requires a student session to be running simultaneously. Coordinate with another tester or open a second browser profile.

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| A6.1 | Open **Monitor** tab | Dashboard loads; shows student grid/list | |
| A6.2 | Student logs in and starts exam (in second browser) | Student appears in the grid with status "active" | |
| A6.3 | Student answers a question | Answer count updates in real time without page refresh | |
| A6.4 | Watch the student's current question indicator update as they navigate | "Viewing Q3" or similar updates live | |
| A6.5 | Toggle between **Grid** and **List** view | Both views show correct data | |
| A6.6 | Filter by centre | Only students from that centre shown | |
| A6.7 | Filter by status (active, pending, submitted) | Correctly filters | |
| A6.8 | Click on a student card/row to open the **Student Detail Modal** | Modal opens showing student info, answer timeline, strike log | |
| A6.9 | From the modal, retrieve the student's password | Password displayed | |
| A6.10 | Trigger a strike from the student session (e.g. exit fullscreen) | Strike count increments in real time on the admin dashboard | |
| A6.11 | Student submits the exam | Status changes to "submitted" in real time | |

---

### A7 — Results (Results Tab)

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| A7.1 | Open **Results** tab after at least one student has submitted | Leaderboard shows submitted students with scores | |
| A7.2 | Sort by score (ascending and descending) | List reorders correctly | |
| A7.3 | Search/filter by student name or roll number | Matching students shown | |
| A7.4 | Check score band distribution chart (0-29, 30-49, 50-69, 70-89, 90-100) | Students counted in correct bands | |
| A7.5 | Click **Export CSV** | CSV file downloads with student results | |
| A7.6 | Open the CSV — verify it has name, roll number, score, and other expected columns | Data matches the dashboard view | |

---

## Part 2: Student End-to-End Testing

**Login URL:** `/` (root)

> Use a separate browser or incognito window from your admin session.

---

### S1 — Student Login

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| S1.1 | Go to `/` | Student login page loads; shows exam countdown or an "exam is open" banner depending on the configured time | |
| S1.2 | Submit with empty fields | Validation error shown | |
| S1.3 | Submit with wrong roll number or password | Error message shown | |
| S1.4 | Submit with correct credentials (roll number = phone number, password = DOB+last4phone) | Navigated to the exam page | |
| S1.5 | Try logging in before the exam start time (with test mode OFF) | Blocked with a "exam not started" message | |
| S1.6 | Try logging in with test mode ON (regardless of time) | Login succeeds | |

> **Default password format:** `DDMMYYYY` + last 4 digits of phone. E.g. student born 15 March 2005, phone ending 7890 → `150320057890`

---

### S2 — Exam Start & Question Display

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| S2.1 | After login, exam page loads | First question displayed; countdown timer visible | |
| S2.2 | Verify the question has 4 answer options | All 4 options rendered | |
| S2.3 | Verify the UI is in the correct language (English or Arabic) | Correct text direction (LTR for English, RTL for Arabic) | |
| S2.4 | Check that fullscreen mode is enforced | Browser enters fullscreen on exam start | |
| S2.5 | Check that right-click is disabled | Right-click context menu does not appear | |
| S2.6 | Check that Ctrl+C is blocked (select question text and try to copy) | No content copied to clipboard (or blocked silently) | |
| S2.7 | Compare two students' question order for the same paper set | Questions appear in different order for different students | |
| S2.8 | Compare two students' answer option order for the same question | Options appear in different order for different students | |

---

### S3 — Answering Questions

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| S3.1 | Select an answer option | Option highlights/selects visually | |
| S3.2 | Navigate to the next question | Next question shown; previous answer retained | |
| S3.3 | Navigate back to the previous question | Previous question shown with the saved answer still selected | |
| S3.4 | Change a previously selected answer | New answer selected; saves correctly | |
| S3.5 | Skip a question (navigate without selecting) | No answer saved for that question; can return later | |
| S3.6 | Reload the page mid-exam | Exam resumes; previously saved answers are still selected | |
| S3.7 | Disconnect internet briefly (5-10 seconds) then reconnect | Exam continues; no data lost | |

---

### S4 — Anti-Cheat / Proctoring

> Each test below should cause a **strike** to appear on the admin Monitor tab. After **3 strikes**, the exam auto-submits.

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| S4.1 | Exit fullscreen (press Escape or F11) | Warning shown to student; strike count increases by 1; admin sees the strike in real time | |
| S4.2 | Switch to another browser tab (Alt+Tab or click taskbar) | Strike triggered upon returning to the exam | |
| S4.3 | Click outside the browser window (window blur) | Strike triggered | |
| S4.4 | Press F12 (DevTools shortcut) | Key blocked; strike triggered | |
| S4.5 | Press Ctrl+T (new tab shortcut) | Key blocked; strike triggered | |
| S4.6 | Accumulate exactly 3 strikes | Exam auto-submits; student sees submission confirmation page | |
| S4.7 | On admin Monitor tab, verify the flagged student is marked as "flagged" | Student card/row shows flagged status | |

> **Coordinate with the admin tester** to verify strike counts in real time during S4 tests.

---

### S5 — Exam Timer

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| S5.1 | Verify the countdown timer is visible and counting down | Timer decrements every second | |
| S5.2 | Set a very short exam duration (e.g. 2 minutes) in Config, then start a student exam | Timer counts down to zero | |
| S5.3 | Allow the timer to reach zero without submitting | Exam auto-submits; student navigated to `/submitted` | |

---

### S6 — Manual Submission

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| S6.1 | Answer some questions and click the **Submit** button | Confirmation prompt shown ("are you sure?") | |
| S6.2 | Cancel on the confirmation prompt | Returned to exam; no submission | |
| S6.3 | Submit again and confirm | Navigated to `/submitted` confirmation page | |
| S6.4 | Try to navigate back to `/exam` after submission | Blocked; redirected to `/submitted` or login | |
| S6.5 | Try logging in again with the same credentials after submission | Blocked with an "already submitted" message | |

---

### S7 — Post-Exam

| # | Step | Expected Result | Pass/Fail |
|---|---|---|---|
| S7.1 | Submission confirmation page (`/submitted`) loads | Clear confirmation message displayed; no score shown to student | |
| S7.2 | On admin Results tab, check the submitted student's score | Score calculated and shown | |
| S7.3 | Verify the score is correct given the answers selected | Correct answers match questions in the Questions tab | |

---

## Part 3: Edge Cases & Stress Tests

These are secondary tests to run after the main flows pass.

| # | Scenario | Steps | Expected Result | Pass/Fail |
|---|---|---|---|---|
| E1 | Concurrent students | Log in with 3–5 different student accounts simultaneously | All sessions work independently; admin Monitor shows all students active | |
| E2 | Network drop during answer save | Submit an answer, immediately disconnect network for 3 seconds, reconnect | Answer is saved (auto-retry) or the UI shows an error and retries | |
| E3 | Long inactivity | Leave exam page open without interaction for 10 minutes | Session remains valid; exam continues | |
| E4 | Admin resets a student mid-exam | Admin opens Student Detail Modal and resets the student | Student is returned to "pending" state; must log in again | |
| E5 | Admin deletes a student mid-exam | Admin deletes a student while they are active | Student session ends or is invalidated gracefully | |
| E6 | Import with duplicate phone numbers | Import Excel with two rows sharing the same phone | System rejects duplicates or handles gracefully with a warning | |
| E7 | Questions with Arabic text | Create a question with Arabic text and options | Displayed correctly in RTL in the student exam | |
| E8 | Admin OCR question extraction | Upload a clear photo of a printed MCQ question | System extracts recognisable text; admin can review and adjust before saving | |
| E9 | Results CSV with special characters | Student name contains Arabic or special characters | CSV exports without corruption; opens correctly in Excel | |
| E10 | IP restriction enforcement | Enable IP restriction with a non-matching CIDR; try student login | Student blocked with a message about network/centre restriction | |

---

## Part 4: Invigilator Role (If Testing)

The invigilator role has a **restricted view** of the dashboard. Use invigilator credentials (if provided) to verify:

| # | Step | Expected Result |
|---|---|---|
| I1 | Log in at `/admin` with invigilator credentials | Redirected to dashboard |
| I2 | Verify **Import**, **Questions**, **Config**, and **Results** tabs are hidden or inaccessible | Only Monitor (and possibly Centres) visible |
| I3 | Monitor tab shows only students from the invigilator's assigned centre | Students from other centres not shown |
| I4 | Attempt to access a restricted API endpoint directly (e.g. `/api/admin/results`) | 403 Forbidden returned |

---

## Summary Checklist

Use this as your sign-off checklist before declaring the build ready:

- [ ] Admin can log in and out
- [ ] Admin can configure the exam (time, duration, test mode)
- [ ] Admin can manage centres
- [ ] Admin can import students from Excel
- [ ] Admin can create, edit, and delete questions
- [ ] Admin can monitor live student activity in real time
- [ ] Admin can view individual student details (answers, strikes, password)
- [ ] Admin can reset or delete a student
- [ ] Admin can view results and export CSV
- [ ] Student login works with generated credentials
- [ ] Exam loads with correct questions and timer
- [ ] Questions and options are shuffled per student
- [ ] Answers auto-save on selection
- [ ] Answers persist on page reload
- [ ] Anti-cheat strikes work and appear in admin dashboard
- [ ] 3 strikes auto-submits the exam
- [ ] Timer auto-submits the exam on expiry
- [ ] Manual submission works with confirmation
- [ ] Cannot re-enter exam after submission
- [ ] Scores are calculated correctly in Results tab
- [ ] Invigilator role has restricted access (if applicable)

---

*For issues or questions, contact the system administrator.*
