from fastapi import APIRouter, HTTPException, Depends, Request
from auth import create_token, verify_password
from database import get_db
from datetime import datetime, timezone
import time

router = APIRouter()

# Global cache for performance — includes test_mode for login checks
_PUBLIC_CONFIG_CACHE = {"data": None, "expiry": 0}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _get_cached_config(db) -> dict:
    now = time.time()
    if _PUBLIC_CONFIG_CACHE["data"] is None or now > _PUBLIC_CONFIG_CACHE["expiry"]:
        cfg = await db.fetchrow(
            "SELECT exam_start_time, exam_duration_minutes, test_mode FROM exam_config WHERE id = 1"
        )
        _PUBLIC_CONFIG_CACHE["data"] = {
            "exam_start_time": (
                cfg["exam_start_time"].isoformat()
                if cfg and cfg["exam_start_time"]
                else None
            ),
            "exam_duration_minutes": cfg["exam_duration_minutes"] if cfg else 180,
            "test_mode": cfg["test_mode"] if cfg else False,
        }
        _PUBLIC_CONFIG_CACHE["expiry"] = now + 60
    return _PUBLIC_CONFIG_CACHE["data"]


@router.post("/login")
async def student_login(body: dict, request: Request, db=Depends(get_db)):
    roll = "".join(filter(str.isdigit, body.get("roll_number") or ""))
    password = (body.get("password") or "").strip()

    if not roll or not password:
        raise HTTPException(400, "Roll number and password are required")

    student = await db.fetchrow("SELECT * FROM students WHERE roll_number = $1", roll)
    if not student:
        raise HTTPException(404, "Roll number not found")
    if student["password"] != password:
        raise HTTPException(401, "Incorrect password")

    # Exam is strictly determined by the admin-assigned exam_id — no student choice, no fallback.
    if not student.get("exam_id"):
        raise HTTPException(403, "You are not registered for any exam. Please contact your invigilator.")
    exam = await db.fetchrow(
        "SELECT * FROM exams WHERE id = $1", student["exam_id"]
    )
    if exam is None:
        raise HTTPException(403, "Your assigned exam no longer exists. Please contact your invigilator.")

    # Check exam start time and grace window
    if not exam["test_mode"]:
        if exam["exam_start_time"] is None:
            raise HTTPException(503, "Exam not scheduled")
        from datetime import timedelta
        start_dt = exam["exam_start_time"].replace(tzinfo=timezone.utc)
        now = _utcnow()
        if now < start_dt:
            raise HTTPException(
                403,
                {"code": "EXAM_NOT_STARTED", "exam_start_time": exam["exam_start_time"].isoformat()},
            )
        grace = int(exam.get("grace_minutes") or 0)
        if grace > 0:
            login_deadline = start_dt + timedelta(minutes=grace)
            if now > login_deadline:
                raise HTTPException(
                    403,
                    {"code": "EXAM_LOGIN_CLOSED", "login_deadline": login_deadline.isoformat()},
                )

    token = create_token(
        {
            "sub": roll,
            "role": "student",
            "exam_id": exam["id"],
            "centre_id": student["centre_id"],
            "paper_set": student["paper_set"],
            "stream": student["stream"],
            "student_id": student["id"],
        },
        expires_minutes=int(exam["exam_duration_minutes"] or 180) + 60,
    )

    return {
        "token": token,
        "student": {
            "roll_number": roll,
            "name_en": student["name_en"],
            "name_ar": student["name_ar"],
            "stream": student["stream"],
            "course": student["course"],
            "centre_id": student["centre_id"],
            "paper_set": student["paper_set"],
            "status": student["status"],
            "exam_id": exam["id"],
            "exam_name": exam["name"],
        },
    }


@router.get("/config/public")
async def public_config(exam_code: str = "DEFAULT", db=Depends(get_db)):
    """Returns exam timing info for a given exam code — no auth needed."""
    from datetime import timedelta
    exam = await db.fetchrow(
        "SELECT exam_start_time, exam_duration_minutes, section_durations, section_auto_advance, test_mode, grace_minutes FROM exams WHERE code = $1",
        exam_code.upper(),
    )
    if not exam:
        # Fall back to legacy config
        cfg = await _get_cached_config(db)
        return {
            "exam_start_time": cfg["exam_start_time"],
            "exam_duration_minutes": cfg["exam_duration_minutes"],
            "section_durations": {},
            "section_auto_advance": True,
            "test_mode": cfg["test_mode"],
            "grace_minutes": 0,
            "login_deadline": None,
        }
    grace = int(exam["grace_minutes"] or 0)
    login_deadline = None
    if grace > 0 and exam["exam_start_time"]:
        start_dt = exam["exam_start_time"].replace(tzinfo=timezone.utc)
        login_deadline = (start_dt + timedelta(minutes=grace)).isoformat()
    return {
        "exam_start_time": exam["exam_start_time"].isoformat() if exam["exam_start_time"] else None,
        "exam_duration_minutes": exam["exam_duration_minutes"],
        "section_durations": exam["section_durations"] or {},
        "section_auto_advance": exam["section_auto_advance"],
        "test_mode": bool(exam["test_mode"]),
        "grace_minutes": grace,
        "login_deadline": login_deadline,
    }


