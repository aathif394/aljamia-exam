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

    row = await db.fetchrow(
        """
        SELECT s.*, e.id AS exam_id_e, e.name AS exam_name_e,
               e.exam_start_time, e.exam_duration_minutes, e.test_mode,
               e.grace_minutes, e.section_durations, e.section_descriptions,
               e.section_auto_advance
        FROM students s
        JOIN exams e ON s.exam_id = e.id
        WHERE s.roll_number = $1
        """,
        roll,
    )
    if not row:
        raise HTTPException(404, "Roll number not found")
    if row["password"] != password:
        raise HTTPException(401, "Incorrect password")

    student = row
    exam = row

    # Check exam start time and grace window
    if not row["test_mode"]:
        if row["exam_start_time"] is None:
            raise HTTPException(503, "Exam not scheduled")
        from datetime import timedelta
        start_dt = row["exam_start_time"].replace(tzinfo=timezone.utc)
        now = _utcnow()
        if now < start_dt:
            raise HTTPException(
                403,
                {"code": "EXAM_NOT_STARTED", "exam_start_time": row["exam_start_time"].isoformat()},
            )
        grace = int(row["grace_minutes"] or 0)
        if grace > 0:
            login_deadline = start_dt + timedelta(minutes=grace)
            if now > login_deadline:
                raise HTTPException(
                    403,
                    {"code": "EXAM_LOGIN_CLOSED", "login_deadline": login_deadline.isoformat()},
                )

    exam_id = row["exam_id_e"]
    exam_name = row["exam_name_e"]

    token = create_token(
        {
            "sub": roll,
            "role": "student",
            "exam_id": exam_id,
            "centre_id": row["centre_id"],
            "paper_set": row["paper_set"],
            "stream": row["stream"],
            "student_id": row["id"],
        },
        expires_minutes=int(row["exam_duration_minutes"] or 180) + 60,
    )

    return {
        "token": token,
        "student": {
            "roll_number": roll,
            "name_en": row["name_en"],
            "name_ar": row["name_ar"],
            "stream": row["stream"],
            "course": row["course"],
            "centre_id": row["centre_id"],
            "paper_set": row["paper_set"],
            "status": row["status"],
            "exam_id": exam_id,
            "exam_name": exam_name,
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


