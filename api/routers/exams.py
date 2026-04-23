"""
Exams router — multi-exam CRUD + results publishing.
All exam configuration now lives here instead of the singleton exam_config table.
"""

import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from auth import verify_admin_token, verify_superadmin_token
from database import get_db

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_exam(row: dict) -> dict:
    d = dict(row)
    for field in (
        "exam_start_time",
        "results_publish_time",
        "created_at",
        "updated_at",
    ):
        if d.get(field):
            d[field] = d[field].isoformat()
    if isinstance(d.get("allowed_ip_ranges"), str):
        d["allowed_ip_ranges"] = json.loads(d["allowed_ip_ranges"])
    if isinstance(d.get("section_durations"), str):
        d["section_durations"] = json.loads(d["section_durations"])
    if isinstance(d.get("section_descriptions"), str):
        d["section_descriptions"] = json.loads(d["section_descriptions"])
    # asyncpg returns NUMERIC as Decimal; convert to float so orjson can serialize
    for field in (
        "pass_mark",
        "grace_minutes",
        "exam_duration_minutes",
        "student_count",
        "active_count",
        "submitted_count",
    ):
        if d.get(field) is not None:
            try:
                d[field] = float(d[field])
            except (TypeError, ValueError):
                pass
    return d


# ── List all exams ─────────────────────────────────────────────────────────────
@router.get("")
async def list_exams(payload=Depends(verify_admin_token), db=Depends(get_db)):
    rows = await db.fetch("""
        SELECT e.*,
               COUNT(s.id) AS student_count,
               COUNT(s.id) FILTER (WHERE s.status = 'active')    AS active_count,
               COUNT(s.id) FILTER (WHERE s.status = 'submitted' OR s.status = 'flagged') AS submitted_count
        FROM exams e
        LEFT JOIN students s ON s.exam_id = e.id
        WHERE e.code != 'DEFAULT' OR e.code = 'DEFAULT'
        GROUP BY e.id
        ORDER BY e.created_at DESC
    """)
    return [_serialize_exam(dict(r)) for r in rows]


# ── Get one exam ───────────────────────────────────────────────────────────────
@router.get("/{exam_id}")
async def get_exam(
    exam_id: int, payload=Depends(verify_admin_token), db=Depends(get_db)
):
    row = await db.fetchrow(
        """
        SELECT e.*,
               COUNT(s.id) AS student_count,
               COUNT(s.id) FILTER (WHERE s.status = 'active')    AS active_count,
               COUNT(s.id) FILTER (WHERE s.status = 'submitted' OR s.status = 'flagged') AS submitted_count
        FROM exams e
        LEFT JOIN students s ON s.exam_id = e.id
        WHERE e.id = $1
        GROUP BY e.id
    """,
        exam_id,
    )
    if not row:
        raise HTTPException(404, "Exam not found")
    return _serialize_exam(dict(row))


# ── Create exam ────────────────────────────────────────────────────────────────
@router.post("")
async def create_exam(
    body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)
):
    name = (body.get("name") or "").strip()
    code = (body.get("code") or "").strip().upper()
    if not name or not code:
        raise HTTPException(400, "name and code are required")

    start_time = None
    if body.get("exam_start_time"):
        try:
            start_time = datetime.fromisoformat(
                body["exam_start_time"].replace("Z", "+00:00")
            )
        except ValueError:
            raise HTTPException(400, "Invalid exam_start_time format")

    results_publish_time = None
    if body.get("results_publish_time"):
        try:
            results_publish_time = datetime.fromisoformat(
                body["results_publish_time"].replace("Z", "+00:00")
            )
        except ValueError:
            raise HTTPException(400, "Invalid results_publish_time format")

    try:
        row = await db.fetchrow(
            """
            INSERT INTO exams (name, name_ar, code, exam_start_time, exam_duration_minutes,
                               ip_restriction, allowed_ip_ranges, test_mode,
                               results_publish_time, section_durations, section_descriptions,
                               section_auto_advance, notify_email, notify_sms, status,
                               grace_minutes, pass_mark, shuffle_questions)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18)
            RETURNING id, code
        """,
            name,
            body.get("name_ar", ""),
            code,
            start_time,
            int(body.get("exam_duration_minutes", 180)),
            bool(body.get("ip_restriction", False)),
            json.dumps(body.get("allowed_ip_ranges", [])),
            bool(body.get("test_mode", False)),
            results_publish_time,
            json.dumps(body.get("section_durations", {})),
            json.dumps(body.get("section_descriptions", {})),
            bool(body.get("section_auto_advance", True)),
            bool(body.get("notify_email", False)),
            bool(body.get("notify_sms", False)),
            body.get("status", "draft"),
            int(body.get("grace_minutes", 0)),
            float(body.get("pass_mark", 0)),
            bool(body.get("shuffle_questions", True)),
        )
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(409, f"Exam code '{code}' already exists")
        raise HTTPException(500, str(e))

    exam_id = row["id"]

    # Auto-create A/B paper sets for this exam
    await db.execute(
        """
        INSERT INTO papers (exam_id, set_code, name_en, name_ar)
        VALUES ($1, 'A', 'Paper Set A', 'المجموعة أ'),
               ($1, 'B', 'Paper Set B', 'المجموعة ب')
        ON CONFLICT (exam_id, set_code) DO NOTHING
    """,
        exam_id,
    )

    return {"id": exam_id, "code": code}


# ── Update exam ────────────────────────────────────────────────────────────────
@router.put("/{exam_id}")
async def update_exam(
    exam_id: int,
    body: dict,
    payload=Depends(verify_superadmin_token),
    db=Depends(get_db),
):
    exam = await db.fetchrow("SELECT id FROM exams WHERE id = $1", exam_id)
    if not exam:
        raise HTTPException(404, "Exam not found")

    start_time = None
    if body.get("exam_start_time"):
        try:
            start_time = datetime.fromisoformat(
                body["exam_start_time"].replace("Z", "+00:00")
            )
        except ValueError:
            raise HTTPException(400, "Invalid exam_start_time format")

    results_publish_time = None
    if body.get("results_publish_time"):
        try:
            results_publish_time = datetime.fromisoformat(
                body["results_publish_time"].replace("Z", "+00:00")
            )
        except ValueError:
            raise HTTPException(400, "Invalid results_publish_time format")

    await db.execute(
        """
        UPDATE exams SET
            name                   = COALESCE($1, name),
            name_ar                = COALESCE($2, name_ar),
            exam_start_time        = COALESCE($3, exam_start_time),
            exam_duration_minutes  = COALESCE($4, exam_duration_minutes),
            ip_restriction         = COALESCE($5, ip_restriction),
            allowed_ip_ranges      = COALESCE($6::jsonb, allowed_ip_ranges),
            test_mode              = COALESCE($7, test_mode),
            results_publish_time   = COALESCE($8, results_publish_time),
            section_durations      = COALESCE($9::jsonb, section_durations),
            section_descriptions   = COALESCE($10::jsonb, section_descriptions),
            section_auto_advance   = COALESCE($11, section_auto_advance),
            notify_email           = COALESCE($12, notify_email),
            notify_sms             = COALESCE($13, notify_sms),
            status                 = COALESCE($14, status),
            grace_minutes          = COALESCE($15, grace_minutes),
            pass_mark              = COALESCE($16, pass_mark),
            shuffle_questions      = COALESCE($17, shuffle_questions),
            updated_at             = NOW()
        WHERE id = $18
    """,
        body.get("name"),
        body.get("name_ar"),
        start_time,
        body.get("exam_duration_minutes"),
        body.get("ip_restriction"),
        json.dumps(body["allowed_ip_ranges"]) if "allowed_ip_ranges" in body else None,
        body.get("test_mode"),
        results_publish_time,
        json.dumps(body["section_durations"]) if "section_durations" in body else None,
        json.dumps(body["section_descriptions"])
        if "section_descriptions" in body
        else None,
        body.get("section_auto_advance"),
        body.get("notify_email"),
        body.get("notify_sms"),
        body.get("status"),
        body["grace_minutes"] if "grace_minutes" in body else None,
        body["pass_mark"] if "pass_mark" in body else None,
        body["shuffle_questions"] if "shuffle_questions" in body else None,
        exam_id,
    )
    return {"updated": True}


# ── Delete exam ────────────────────────────────────────────────────────────────
@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: int, payload=Depends(verify_superadmin_token), db=Depends(get_db)
):
    exam = await db.fetchrow("SELECT code FROM exams WHERE id = $1", exam_id)
    if not exam:
        raise HTTPException(404, "Exam not found")
    if exam["code"] == "DEFAULT":
        raise HTTPException(400, "Cannot delete the default exam")
    await db.execute("DELETE FROM exams WHERE id = $1", exam_id)
    return {"deleted": True}


# ── Public results endpoint (student-facing) ───────────────────────────────────
@router.get("/{exam_id}/results/public")
async def public_results(exam_id: int, db=Depends(get_db)):
    exam = await db.fetchrow(
        "SELECT id, name, results_publish_time FROM exams WHERE id = $1", exam_id
    )
    if not exam:
        raise HTTPException(404, "Exam not found")

    pub_time = exam["results_publish_time"]
    if pub_time is None or _utcnow() < pub_time.replace(tzinfo=timezone.utc):
        raise HTTPException(
            403,
            {
                "code": "NOT_PUBLISHED",
                "publish_time": pub_time.isoformat() if pub_time else None,
            },
        )

    rows = await db.fetch(
        """
        SELECT s.roll_number, s.name_en, s.name_ar, s.stream, s.course,
               s.paper_set, s.score, s.status, s.submit_time,
               c.name_en AS centre_name
        FROM students s
        LEFT JOIN centres c ON s.centre_id = c.id
        WHERE s.exam_id = $1 AND s.status IN ('submitted', 'flagged')
        ORDER BY s.score DESC, s.submit_time ASC
    """,
        exam_id,
    )

    return {
        "exam_name": exam["name"],
        "published_at": pub_time.isoformat(),
        "results": [
            {
                "rank": i + 1,
                "roll_number": r["roll_number"],
                "name_en": r["name_en"],
                "name_ar": r["name_ar"],
                "stream": r["stream"],
                "course": r["course"],
                "paper_set": r["paper_set"],
                "score": float(r["score"] or 0),
                "centre_name": r["centre_name"],
                "submit_time": r["submit_time"].isoformat()
                if r["submit_time"]
                else None,
            }
            for i, r in enumerate(rows)
        ],
    }


# ── Admin: list all published exams (for student results page) ────────────────
# @router.get("/public/list")
# async def list_public_exams(db=Depends(get_db)):
#     """No auth — returns only exams whose results are published."""
#     rows = await db.fetch("""
#         SELECT id, name, name_ar, code, results_publish_time
#         FROM exams
#         WHERE results_publish_time IS NOT NULL
#           AND results_publish_time <= NOW()
#           AND code != 'DEFAULT'
#         ORDER BY results_publish_time DESC
#     """)
#     return [
#         {
#             "id": r["id"],
#             "name": r["name"],
#             "name_ar": r["name_ar"],
#             "code": r["code"],
#             "published_at": r["results_publish_time"].isoformat(),
#         }
#         for r in rows
#     ]


# ── Admin: list all published exams (for student results page) ────────────────
@router.get("/public/list")
async def list_public_exams(db=Depends(get_db)):
    """No auth — returns only exams whose results are published."""
    rows = await db.fetch(
        """
        SELECT id, name, name_ar, code, results_publish_time
        FROM exams
        WHERE results_publish_time IS NOT NULL
          AND results_publish_time <= NOW()
        ORDER BY results_publish_time DESC
    """
    )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "name_ar": r["name_ar"],
            "code": r["code"],
            "published_at": r["results_publish_time"].isoformat(),
        }
        for r in rows
    ]


# ── Manual publish trigger (admin) ─────────────────────────────────────────────
@router.post("/{exam_id}/publish")
async def publish_results(
    exam_id: int,
    body: dict,
    payload=Depends(verify_superadmin_token),
    db=Depends(get_db),
):
    """Set results_publish_time to now (or a future time) and optionally reset notifications_sent."""
    publish_time_str = body.get("results_publish_time")
    reset_notifications = body.get("reset_notifications", False)

    if publish_time_str:
        try:
            publish_time = datetime.fromisoformat(
                publish_time_str.replace("Z", "+00:00")
            )
        except ValueError:
            raise HTTPException(400, "Invalid results_publish_time format")
    else:
        publish_time = _utcnow()

    await db.execute(
        """
        UPDATE exams SET
            results_publish_time = $1,
            notifications_sent   = CASE WHEN $2 THEN FALSE ELSE notifications_sent END,
            updated_at           = NOW()
        WHERE id = $3
    """,
        publish_time,
        reset_notifications,
        exam_id,
    )

    return {"published": True, "publish_time": publish_time.isoformat()}
