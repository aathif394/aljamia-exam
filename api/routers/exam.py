import json
import time
import random
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from auth import verify_admin_token, verify_student_token
from database import get_db
from routers.ws import broadcast

router = APIRouter()

# Global cache for exam config to save DB trips
_CONFIG_CACHE = {"data": None, "expiry": 0}

# Per-student question cache: roll_number -> processed question list
# Questions are deterministic per student (seeded shuffle/watermark), so this is safe.
_QUESTION_CACHE: dict[str, list] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _get_cached_config(db):
    now = time.time()
    if _CONFIG_CACHE["data"] is None or now > _CONFIG_CACHE["expiry"]:
        row = await db.fetchrow(
            "SELECT exam_duration_minutes FROM exam_config WHERE id = 1"
        )
        _CONFIG_CACHE["data"] = row["exam_duration_minutes"] if row else 180
        _CONFIG_CACHE["expiry"] = now + 30  # Cache for 30 seconds
    return _CONFIG_CACHE["data"]


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host


def _ip_in_ranges(ip: str, ranges: list) -> bool:
    import ipaddress

    try:
        addr = ipaddress.ip_address(ip)
        for cidr in ranges:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
    except ValueError:
        pass
    return False


def _seeded_rng(roll_number: str, question_id: int) -> random.Random:
    seed_str = f"{roll_number}:{question_id}"
    seed_int = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed_int)


def inject_adversarial_noise(text: str, roll_number: str, question_id: int) -> str:
    if not text or len(text) < 5:
        return text

    # ZWNJ (U+200C) = 0-bit, ZWJ (U+200D) = 1-bit.
    # Both have semantic roles in Arabic/Indic scripts, so LLMs and text
    # pre-processors are trained to preserve them — unlike bare U+200B which
    # is routinely stripped. The insertion pattern encodes the student's
    # identity as a 64-bit fingerprint: recoverable by re-running this
    # function on the original text for any suspect roll number.
    ZW_ZERO = "\u200c"  # Zero Width Non-Joiner → 0
    ZW_ONE = "\u200d"  # Zero Width Joiner      → 1

    fp_bytes = hashlib.sha256(f"{roll_number}:{question_id}:v2".encode()).digest()[:8]
    bits = "".join(f"{b:08b}" for b in fp_bytes)  # 64 deterministic bits
    bit_idx = 0

    rng = _seeded_rng(roll_number, question_id)
    words = text.split(" ")
    poisoned_words = []
    for word in words:
        has_non_ascii = any(ord(c) > 127 for c in word)
        if len(word) > 3 and not has_non_ascii and rng.random() > 0.3:
            insert_idx = rng.randint(1, len(word) - 1)
            zw = ZW_ONE if bits[bit_idx % 64] == "1" else ZW_ZERO
            bit_idx += 1
            poisoned_words.append(word[:insert_idx] + zw + word[insert_idx:])
        else:
            poisoned_words.append(word)
    return " ".join(poisoned_words)



def _normalize_stream(stream_val) -> str | None:
    if stream_val is None:
        return None
    s = str(stream_val).strip()
    return None if s == "" else s


@router.post("/start")
async def start_exam(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: dict = Depends(verify_student_token),
    db=Depends(get_db),
):
    # Re-check exam timing here too — a student with a cached token cannot
    # bypass the start-time gate by calling /start directly.
    # cfg = await db.fetchrow(
    #     "SELECT exam_start_time, test_mode FROM exam_config WHERE id = 1"
    # )
    # if cfg and not cfg["test_mode"]:
    #     if cfg["exam_start_time"] is None:
    #         raise HTTPException(503, "Exam not scheduled")
    #     if _utcnow() < cfg["exam_start_time"].replace(tzinfo=timezone.utc):
    #         raise HTTPException(403, {"code": "EXAM_NOT_STARTED", "exam_start_time": cfg["exam_start_time"].isoformat()})

    exam_id = payload.get("exam_id")
    cfg = await db.fetchrow(
        "SELECT exam_start_time, test_mode FROM exams WHERE id = $1",
        exam_id,
    )
    if cfg and not cfg["test_mode"]:
        if cfg["exam_start_time"] is None:
            raise HTTPException(503, "Exam not scheduled")
        if _utcnow() < cfg["exam_start_time"].replace(tzinfo=timezone.utc):
            raise HTTPException(
                403,
                {
                    "code": "EXAM_NOT_STARTED",
                    "exam_start_time": cfg["exam_start_time"].isoformat(),
                },
            )

    # One trip to the DB does everything
    result = await db.fetchval(
        "SELECT start_student_exam($1, $2, $3, $4)",
        payload["sub"],
        payload["stream"],
        payload["paper_set"],
        _client_ip(request),
    )

    # FIX: result is now automatically a dict thanks to the database.py codecs
    res_data = result if isinstance(result, (dict, list)) else json.loads(result)

    if "error" in res_data:
        raise HTTPException(res_data["code"], res_data["error"])

    roll = payload["sub"]
    questions = _QUESTION_CACHE.get(roll)
    if questions is None:
        questions = await _fetch_questions_ordered(db, res_data["question_ids"], roll)
        _QUESTION_CACHE[roll] = questions

    background_tasks.add_task(
        broadcast, {"type": "status_change", "roll": roll, "status": "active"}
    )

    # Return duration and section metadata so the client can set the timer
    # and show section descriptions on fresh start.
    duration = 180
    section_durations: dict = {}
    section_descriptions: dict = {}
    section_auto_advance = True
    if exam_id:
        exam_row = await db.fetchrow(
            "SELECT exam_duration_minutes, section_durations, section_descriptions, section_auto_advance FROM exams WHERE id = $1",
            exam_id,
        )
        if exam_row:
            duration = exam_row["exam_duration_minutes"]
            sd = exam_row["section_durations"]
            section_durations = sd if isinstance(sd, dict) else json.loads(sd or "{}")
            sdesc = exam_row["section_descriptions"]
            section_descriptions = (
                sdesc if isinstance(sdesc, dict) else json.loads(sdesc or "{}")
            )
            section_auto_advance = exam_row["section_auto_advance"]
    print(section_descriptions)
    return {
        **res_data,
        "questions": questions,
        "duration_minutes": duration,
        "section_durations": section_durations,
        "section_descriptions": section_descriptions,
        "section_auto_advance": section_auto_advance,
    }


@router.post("/bulk-reset")
async def bulk_reset(body: dict, db=Depends(get_db)):
    rolls = body.get("rolls", [])
    await db.execute("SELECT bulk_reset_exams($1)", rolls)
    # Clear cached question orders so students get a fresh shuffle on next start
    for roll in rolls:
        _QUESTION_CACHE.pop(str(roll).upper(), None)
    return {"ok": True}


@router.get("/questions")
async def get_questions(
    payload: dict = Depends(verify_student_token), db=Depends(get_db)
):
    roll = payload["sub"]
    exam_id = payload.get("exam_id")
    student = await db.fetchrow(
        "SELECT id, status, question_order, answers, start_time, current_section, section_start_time FROM students WHERE roll_number = $1",
        roll,
    )
    if not student:
        raise HTTPException(404, "Student not found")
    if student["status"] == "pending":
        raise HTTPException(400, "Exam not started yet")

    q_order = (
        student["question_order"]
        if isinstance(student["question_order"], list)
        else json.loads(student["question_order"] or "[]")
    )
    answers = (
        student["answers"]
        if isinstance(student["answers"], dict)
        else json.loads(student["answers"] or "{}")
    )

    questions = _QUESTION_CACHE.get(roll)
    if questions is None:
        questions = await _fetch_questions_ordered(db, q_order, roll)
        _QUESTION_CACHE[roll] = questions

    # Get exam config for duration and section timing
    duration = await _get_cached_config(db)
    section_durations: dict = {}
    section_descriptions: dict = {}
    section_auto_advance = True

    if exam_id:
        exam_row = await db.fetchrow(
            "SELECT exam_duration_minutes, section_durations, section_descriptions, section_auto_advance FROM exams WHERE id = $1",
            exam_id,
        )
        if exam_row:
            duration = exam_row["exam_duration_minutes"]
            sd = exam_row["section_durations"]
            section_durations = sd if isinstance(sd, dict) else json.loads(sd or "{}")
            section_auto_advance = exam_row["section_auto_advance"]
            sdesc = exam_row["section_descriptions"]
            section_descriptions = (
                sdesc if isinstance(sdesc, dict) else json.loads(sdesc or "{}")
            )

    return {
        "questions": questions,
        "answers": answers,
        "start_time": (
            student["start_time"].isoformat() if student["start_time"] else None
        ),
        "duration_minutes": duration,
        "status": student["status"],
        "current_section": student["current_section"] or 1,
        "section_start_time": (
            student["section_start_time"].isoformat()
            if student["section_start_time"]
            else None
        ),
        "section_durations": section_durations,
        "section_descriptions": section_descriptions,
        "section_auto_advance": section_auto_advance,
    }


async def _fetch_questions_ordered(db, q_ids: list, roll_number: str) -> list:
    if not q_ids:
        return []
    rows = await db.fetch(
        """SELECT id, section, question_number, type, language,
                  question_en, question_ar, options_en, options_ar,
                  correct_answer, marks, stream
           FROM questions WHERE id = ANY($1::int[])""",
        q_ids,
    )
    by_id = {r["id"]: dict(r) for r in rows}
    ordered = []
    for i, qid in enumerate(q_ids):
        if qid not in by_id:
            continue
        q = by_id[qid].copy()
        q["display_number"] = i + 1

        if q.get("question_en"):
            q["question_en"] = inject_adversarial_noise(
                q["question_en"], roll_number, qid
            )
        if q.get("question_ar"):
            q["question_ar"] = inject_adversarial_noise(
                q["question_ar"], roll_number, qid
            )

        if q["type"] == "mcq":

            def _parse(opts):
                if isinstance(opts, list):
                    return opts
                try:
                    return json.loads(opts) if opts else []
                except:
                    return []

            opts_en = _parse(q.get("options_en"))
            opts_ar = _parse(q.get("options_ar"))

            if opts_en:
                # Deterministic shuffle for this student
                indices = list(range(len(opts_en)))
                rng = _seeded_rng(roll_number, qid)
                rng.shuffle(indices)
                
                shuffled_en = [opts_en[i] for i in indices]
                q["options_en"] = json.dumps(shuffled_en)
                
                if opts_ar and len(opts_ar) == len(opts_en):
                    shuffled_ar = [opts_ar[i] for i in indices]
                    q["options_ar"] = json.dumps(shuffled_ar)
                elif opts_ar:
                    q["options_ar"] = json.dumps(opts_ar)
            elif opts_ar:
                q["options_ar"] = json.dumps(opts_ar)

        q.pop("correct_answer", None)
        ordered.append(q)
    return ordered


@router.post("/answer")
async def save_answer(
    body: dict,
    background_tasks: BackgroundTasks,
    payload: dict = Depends(verify_student_token),
    db=Depends(get_db),
):
    student_id = payload["student_id"]
    roll = payload["sub"]
    q_id = body.get("question_id")
    answer = body.get("answer", "")

    if not q_id:
        raise HTTPException(400, "question_id required")

    # Single round trip: status check + upsert student_answers + update JSONB
    saved = await db.fetchval(
        """
        WITH guard AS (
            SELECT id FROM students WHERE id = $1 AND status IN ('active', 'flagged')
        ),
        upsert AS (
            INSERT INTO student_answers (student_id, question_id, answer_text, updated_at)
            SELECT $1, $2, $3, $4 FROM guard
            ON CONFLICT (student_id, question_id)
            DO UPDATE SET answer_text = EXCLUDED.answer_text, updated_at = EXCLUDED.updated_at
            RETURNING student_id
        )
        UPDATE students
           SET answers = jsonb_set(COALESCE(answers, '{}'), $5, $6::jsonb)
         WHERE id IN (SELECT student_id FROM upsert)
        RETURNING id
        """,
        student_id,
        q_id,
        answer,
        _utcnow(),
        [str(q_id)],
        json.dumps(answer),
    )

    if saved is None:
        raise HTTPException(400, "Exam not active")

    # Use BackgroundTasks for WebSockets to hit <500ms targets
    background_tasks.add_task(
        broadcast, {"type": "answer_saved", "roll": roll, "q_id": q_id}
    )

    return {"saved": True}


@router.post("/submit")
async def submit_exam(
    background_tasks: BackgroundTasks,
    payload: dict = Depends(verify_student_token),
    db=Depends(get_db),
):
    student_id = payload["student_id"]
    roll = payload["sub"]

    async with db.transaction():
        student = await db.fetchrow(
            "SELECT id, status, answers, question_order FROM students WHERE id = $1 FOR UPDATE",
            student_id,
        )

        if not student:
            raise HTTPException(404, "Student not found")

        # Idempotency: If already submitted, just return success
        if student["status"] == "submitted":
            return {"submitted": True, "score": student.get("score") or 0}

        answers = (
            student["answers"]
            if isinstance(student["answers"], dict)
            else json.loads(student["answers"] or "{}")
        )
        q_order = (
            student["question_order"]
            if isinstance(student["question_order"], list)
            else json.loads(student["question_order"] or "[]")
        )

        # Robust grading
        score = 0
        try:
            score = await _calculate_score(db, answers, q_order, roll)
        except Exception as e:
            print(f"CRITICAL: Auto-grading failed for student {roll}: {e}")
            import traceback
            traceback.print_exc()

        await db.execute(
            "UPDATE students SET status = 'submitted', submit_time = $1, score = $2 WHERE id = $3",
            _utcnow(),
            score,
            student_id,
        )

    # WebSocket broadcast
    background_tasks.add_task(
        broadcast, {"type": "submitted", "roll": roll, "score": float(score)}
    )

    return {"submitted": True, "score": score}

def _normalize_text(text: str) -> str:
    """Robustly normalize text for fuzzy matching."""
    if not text:
        return ""
    import re
    # Lowercase, strip
    t = text.strip().lower()
    # Remove basic punctuation from start/end (like full stops, commas)
    t = re.sub(r"^[^\w]+|[^\w]+$", "", t, flags=re.UNICODE)
    # Collapse multiple spaces
    t = re.sub(r"\s+", " ", t)
    return t


async def _calculate_score(db, answers: dict, q_order: list, roll_number: str) -> float:
    """Grades the exam. MCQ answers are labels (A/B/C/D) compared directly — options are not shuffled."""
    if not q_order:
        return 0.0

    questions = await db.fetch(
        "SELECT id, type, correct_answer, options_en, marks FROM questions WHERE id = ANY($1)",
        q_order,
    )
    q_map = {r["id"]: r for r in questions}

    total = 0.0
    for q_id in q_order:
        row = q_map.get(q_id)
        if not row or row["type"] == "descriptive":
            continue

        student_ans = (answers.get(str(q_id)) or "").strip()
        if not student_ans:
            continue

        correct = (row["correct_answer"] or "").strip()
        
        # 1. Multiple Choice (MCQ) - Direct label comparison (options are not shuffled)
        # 1. Multiple Choice (MCQ) - Handle deterministic shuffling
        if row["type"] == "mcq":
            correct_label = correct.upper()
            label_to_idx = {"A": 0, "B": 1, "C": 2, "D": 3}
            idx_to_label = {0: "A", 1: "B", 2: "C", 3: "D"}
            
            orig_idx = label_to_idx.get(correct_label)
            if orig_idx is not None:
                # Re-calculate the same shuffle used in _fetch_questions_ordered
                opts_en = (row["options_en"] if isinstance(row["options_en"], list) 
                           else json.loads(row["options_en"] or "[]"))
                if opts_en:
                    indices = list(range(len(opts_en)))
                    rng = _seeded_rng(roll_number, q_id)
                    rng.shuffle(indices)
                    
                    # Find where the original correct index ended up
                    # original index i is now at new index j where indices[j] == i
                    try:
                        new_idx = indices.index(orig_idx)
                        correct_label = idx_to_label.get(new_idx, correct_label)
                    except ValueError:
                        pass # Should not happen

            if student_ans.upper() == correct_label:
                total += float(row["marks"])

        # 2. True / False - Multilingual Support
        elif row["type"] == "true_false":
            s_norm = _normalize_text(student_ans)
            c_norm = _normalize_text(correct)
            
            # Map variations
            true_vals = {"true", "correct", "صحيح", "صح"}
            false_vals = {"false", "incorrect", "wrong", "خطأ", "خطا"}
            
            is_student_true = s_norm in true_vals or s_norm == "1"
            is_correct_true = c_norm in true_vals or c_norm == "1"
            
            if is_student_true == is_correct_true:
                total += float(row["marks"])

        # 3. Fill in the Blank - Fuzzy Matching
        elif row["type"] == "fill_blank":
            if _normalize_text(student_ans) == _normalize_text(correct):
                total += float(row["marks"])

    return total


@router.post("/strike")
async def record_strike(
    body: dict,
    background_tasks: BackgroundTasks,
    payload: dict = Depends(verify_student_token),
    db=Depends(get_db),
):
    roll = payload["sub"]
    event = body.get("event", "unknown")
    student = await db.fetchrow(
        "SELECT id, strikes, strike_log, status, answers, question_order FROM students WHERE roll_number = $1",
        roll,
    )

    if not student:
        raise HTTPException(404, "Student not found")
    if student["status"] == "submitted":
        return {"status": "submitted"}

    new_strikes = student["strikes"] + 1
    log = (
        student["strike_log"]
        if isinstance(student["strike_log"], list)
        else json.loads(student["strike_log"] or "[]")
    )
    log.append({"time": _utcnow().isoformat(), "event": event})
    new_status = "flagged" if new_strikes >= 3 else student["status"]

    if new_strikes >= 3:
        answers = (
            student["answers"]
            if isinstance(student["answers"], dict)
            else json.loads(student.get("answers") or "{}")
        )
        q_order = (
            student["question_order"]
            if isinstance(student["question_order"], list)
            else json.loads(student.get("question_order") or "[]")
        )
        score = await _calculate_score(db, answers, q_order, roll)
        await db.execute(
            "UPDATE students SET strikes = $1, strike_log = $2, status = 'submitted', submit_time = $3, score = $4 WHERE id = $5",
            new_strikes,
            json.dumps(log),
            _utcnow(),
            score,
            student["id"],
        )
        background_tasks.add_task(
            broadcast, {"type": "submitted", "roll": roll, "score": float(score)}
        )
        return {"strikes": new_strikes, "status": "submitted"}

    await db.execute(
        "UPDATE students SET strikes = $1, strike_log = $2, status = $3 WHERE id = $4",
        new_strikes,
        json.dumps(log),
        new_status,
        student["id"],
    )
    background_tasks.add_task(
        broadcast,
        {
            "type": "strike",
            "roll": roll,
            "strikes": new_strikes,
            "status": new_status,
            "event": event,
        },
    )
    return {"strikes": new_strikes, "status": new_status}


# ── Section advance ───────────────────────────────────────────────────────────
@router.post("/section/next")
async def advance_section(
    background_tasks: BackgroundTasks,
    payload: dict = Depends(verify_student_token),
    db=Depends(get_db),
):
    """Advance to the next section. Returns new current_section and timestamp."""
    roll = payload["sub"]
    student = await db.fetchrow(
        "SELECT id, current_section, status FROM students WHERE roll_number = $1", roll
    )
    if not student or student["status"] not in ("active", "flagged"):
        raise HTTPException(400, "Exam not active")

    new_section = (student["current_section"] or 1) + 1

    await db.execute(
        "UPDATE students SET current_section = $1, section_start_time = NOW() WHERE id = $2",
        new_section,
        student["id"],
    )

    background_tasks.add_task(
        broadcast,
        {"type": "section_advance", "roll": roll, "section": new_section},
    )

    return {"current_section": new_section, "section_start_time": _utcnow().isoformat()}


@router.get("/admin/student-view/{roll_number}")
async def admin_student_view(
    roll_number: str,
    payload=Depends(verify_admin_token),
    db=Depends(get_db),
):
    """Returns questions as the student saw them — ordered and watermarked for their roll number."""
    student = await db.fetchrow(
        "SELECT question_order FROM students WHERE roll_number = $1", roll_number
    )
    if not student:
        raise HTTPException(404, "Student not found")

    q_ids = student["question_order"]
    if isinstance(q_ids, str):
        import json

        q_ids = json.loads(q_ids)

    questions = await _fetch_questions_ordered(db, q_ids, roll_number)
    return {"questions": questions}
