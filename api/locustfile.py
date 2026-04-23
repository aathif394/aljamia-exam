"""
Exam load test — simulates students taking the full exam:
  login → start → answer ALL questions (in order, by type) → submit

Usage:
  # Web UI
  locust -f locustfile.py --host https://aljamia-admission-exam.fly.dev

  # Headless (500 students)
  locust -f locustfile.py --host https://aljamia-admission-exam.fly.dev \
    --users 500 --spawn-rate 50 --run-time 30m --headless --csv results

Credentials file: credentials_2026.csv (roll_number, password columns)
"""

import csv
import json
import random
import threading
from itertools import cycle

import gevent
import websocket
from locust import task, between
from locust.contrib.fasthttp import FastHttpUser

# ── Credential loader (thread-safe cycling) ──────────────────────────────────
CREDENTIALS: list[tuple[str, str]] = []
_cred_lock = threading.Lock()
_cred_cycle: "cycle[tuple[str,str]] | None" = None

CRED_FILE = "credentials_2026.csv"


def load_credentials():
    global _cred_cycle
    paths = [CRED_FILE, f"../{CRED_FILE}", "credentials_2026.csv", "../credentials_2026.csv"]
    for path in paths:
        try:
            with open(path, newline="", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    roll = (
                        row.get("roll_number")
                        or row.get("Roll Number")
                        or row.get("roll")
                        or row.get("Roll")
                        or ""
                    ).strip()
                    pwd = (
                        row.get("password")
                        or row.get("Password")
                        or row.get("pass")
                        or ""
                    ).strip()
                    if roll and pwd:
                        CREDENTIALS.append((roll, pwd))
            if CREDENTIALS:
                _cred_cycle = cycle(CREDENTIALS)
                print(f"[locust] Loaded {len(CREDENTIALS)} credentials from {path}")
                if len(CREDENTIALS) < 500:
                    print(
                        f"[locust] WARNING: Only {len(CREDENTIALS)} credentials for 500 users — "
                        "virtual users will share roll numbers causing DB conflicts."
                    )
                return
        except FileNotFoundError:
            continue
    print(f"[locust] WARNING: No credential file found. Tried: {paths}")


load_credentials()


def next_credential() -> tuple[str, str]:
    with _cred_lock:
        if _cred_cycle is None:
            raise RuntimeError("No credentials loaded")
        return next(_cred_cycle)


# ── Answer picker by question type ───────────────────────────────────────────
_FILL_BLANK_ANSWERS = [
    "osmosis", "mitosis", "photosynthesis", "42", "Newton",
    "carbon dioxide", "hydrogen", "the nucleus", "supply and demand",
    "the constitution", "equilibrium", "force", "velocity",
]

_DESCRIPTIVE_ANSWERS = [
    (
        "The process involves multiple stages that work together systematically. "
        "First, the initial conditions are established, followed by the main reaction. "
        "The outcome depends on the variables present in the environment."
    ),
    (
        "This concept is fundamental to understanding the broader topic. "
        "It can be explained through several key principles: first, the underlying mechanism; "
        "second, its practical applications; and third, the limitations observed in practice."
    ),
    (
        "Based on the available evidence, the most likely explanation is that "
        "the factors interact in a non-linear way. Historical examples support this view, "
        "and modern research continues to refine our understanding of the relationship."
    ),
    (
        "There are three main points to address here. The first relates to the theoretical "
        "framework, which provides the foundation. The second concerns empirical observations "
        "that either confirm or challenge the theory. The third involves practical implications."
    ),
]


def pick_answer(question: dict) -> str:
    qtype = question.get("type", "mcq")

    if qtype == "true_false":
        return random.choice(["true", "false"])

    if qtype == "fill_blank":
        return random.choice(_FILL_BLANK_ANSWERS)

    if qtype == "descriptive":
        return random.choice(_DESCRIPTIVE_ANSWERS)

    # mcq — pick a valid option label based on how many options exist
    options = question.get("options_en") or question.get("options_ar") or []
    if isinstance(options, str):
        try:
            options = json.loads(options)
        except Exception:
            options = []
    labels = ["A", "B", "C", "D", "E", "F"][: max(len(options), 4)]
    return random.choice(labels)


# ── Student user ──────────────────────────────────────────────────────────────
class ExamStudent(FastHttpUser):
    """
    Full exam simulation including WebSocket:
      1. Login
      2. Open /ws/student (held for entire exam duration)
      3. Start exam or resume if already started
      4. Answer every question; send WS viewing event per question
      5. Occasionally send a strike (~5% per question, simulates tab switch)
      6. Submit once all answered; close WS; stop user
    """

    wait_time = between(1, 4)

    token: str = ""
    questions: list = []
    answered_ids: set = set()
    pending: list = []
    done: bool = False
    _ws: "websocket.WebSocketApp | None" = None
    _ws_greenlet = None
    _question_index: int = 0

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    def on_start(self):
        if not CREDENTIALS:
            self.environment.runner.quit()
            return
        roll, password = next_credential()
        self._login(roll, password)

    def on_stop(self):
        self._close_ws()

    # ── WebSocket helpers ─────────────────────────────────────────────────────
    def _ws_url(self) -> str:
        host = self.host.rstrip("/")
        ws_host = host.replace("https://", "wss://").replace("http://", "ws://")
        return f"{ws_host}/ws/student?token={self.token}"

    def _open_ws(self):
        if not self.token:
            return

        def _run():
            self._ws = websocket.WebSocketApp(
                self._ws_url(),
                on_error=lambda ws, err: None,
                on_close=lambda ws, code, msg: None,
            )
            self._ws.run_forever(ping_interval=30, ping_timeout=10)

        self._ws_greenlet = gevent.spawn(_run)

    def _close_ws(self):
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass
        if self._ws_greenlet:
            self._ws_greenlet.kill(block=False)
        self._ws = None
        self._ws_greenlet = None

    def _send_ws(self, payload: dict):
        ws = self._ws
        if ws and ws.sock and ws.sock.connected:
            try:
                ws.send(json.dumps(payload))
            except Exception:
                pass

    # ── Auth + exam init ──────────────────────────────────────────────────────
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}

    def _login(self, roll: str, password: str):
        with self.client.post(
            "/api/students/login",
            json={"roll_number": roll, "password": password},
            catch_response=True,
            name="/api/students/login",
        ) as r:
            if r.status_code == 200:
                self.token = r.json().get("token", "")
                r.success()
                self._open_ws()
                self._start_or_resume()
            else:
                r.failure(f"Login failed {r.status_code}: {r.text[:120]}")

    def _start_or_resume(self):
        with self.client.post(
            "/api/exam/start",
            headers=self._headers(),
            catch_response=True,
            name="/api/exam/start",
        ) as r:
            if r.status_code == 200:
                data = r.json()
                self.questions = data.get("questions", [])
                self.answered_ids = set()
                r.success()
            elif r.status_code in (409, 400):
                r.success()
                self._fetch_existing()
            else:
                r.failure(f"Start failed {r.status_code}: {r.text[:120]}")
                return
        self._build_pending()

    def _fetch_existing(self):
        with self.client.get(
            "/api/exam/questions",
            headers=self._headers(),
            catch_response=True,
            name="/api/exam/questions [resume]",
        ) as r:
            if r.status_code == 200:
                body = r.json()
                self.questions = body.get("questions", [])
                existing: dict = body.get("answers", {})
                self.answered_ids = {
                    int(qid)
                    for qid, ans in existing.items()
                    if ans and str(ans).strip()
                }
                r.success()
            else:
                r.failure(f"Get questions failed {r.status_code}")

    def _build_pending(self):
        self.pending = [
            q for q in self.questions
            if q.get("id") not in self.answered_ids
        ]
        by_section: dict[int, list] = {}
        for q in self.pending:
            s = q.get("section", 0)
            by_section.setdefault(s, []).append(q)
        self.pending = []
        for sec in sorted(by_section):
            group = by_section[sec]
            random.shuffle(group)
            self.pending.extend(group)

    # ── Main answering task ───────────────────────────────────────────────────
    @task
    def answer_next_question(self):
        if self.done or not self.token:
            return

        if not self.pending:
            if not self.questions:
                return  # Still initialising — wait for next tick
            self._submit()
            return

        q = self.pending.pop(0)

        # Simulate student viewing the question
        self._send_ws({"type": "viewing", "question_index": self._question_index})
        self._question_index += 1

        # ~5% chance of a strike per question (tab switch / fullscreen exit)
        if random.random() < 0.05:
            self.client.post(
                "/api/exam/strike",
                json={"event": random.choice(["tab_switch", "fullscreen_exit", "window_blur"])},
                headers=self._headers(),
                name="/api/exam/strike",
            )

        answer = pick_answer(q)

        with self.client.post(
            "/api/exam/answer",
            json={"question_id": q["id"], "answer": answer},
            headers=self._headers(),
            catch_response=True,
            name="/api/exam/answer",
        ) as r:
            if r.status_code == 200:
                self.answered_ids.add(q["id"])
                r.success()
            elif r.status_code == 401:
                r.failure("Unauthorised — token expired")
                self.done = True
                self._close_ws()
                self.stop()
            else:
                self.pending.insert(0, q)
                r.failure(f"Answer save failed {r.status_code}: {r.text[:80]}")

    # ── Submit ────────────────────────────────────────────────────────────────
    def _submit(self):
        if not self.token or self.done:
            return
        with self.client.post(
            "/api/exam/submit",
            headers=self._headers(),
            catch_response=True,
            name="/api/exam/submit",
        ) as r:
            if r.status_code == 200:
                r.success()
            elif r.status_code == 409:
                r.success()  # Already submitted — fine
            else:
                r.failure(f"Submit failed {r.status_code}")
        self.done = True
        self.token = ""
        self._close_ws()
        self.stop()
