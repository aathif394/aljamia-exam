import json
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from auth import verify_password, create_token, verify_admin_token, verify_superadmin_token, hash_password
from database import get_db
from routers.exam import _QUESTION_CACHE

router = APIRouter()

STREAMS = ["commerce", "science", "arts", "general"]


def _roll_from_phone(phone: str) -> str:
    """Roll number = digits of phone number.  e.g. 9876543210
    Students already know their phone number — nothing to memorize."""
    return "".join(filter(str.isdigit, phone))
def _generate_password(dob: str, phone: str) -> str:
    """
    Password format: DDMMYYYY_last4phone  e.g. 15032005_3210
    Safely parses multiple date formats to ensure DDMMYYYY output.
    """
    dob_raw = str(dob).strip()
    phone_clean = "".join(filter(str.isdigit, str(phone)))
    last_4 = phone_clean[-4:] if len(phone_clean) >= 4 else phone_clean.zfill(4)

    # Strip timestamps if Excel/Frontend sent full ISO strings (e.g., "2005-03-15T00:00:00Z")
    dob_only = dob_raw.split("T")[0].split(" ")[0]

    parsed_date = None
    # List of common formats to try (DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY, etc.)
    date_formats = ["%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%d%m%Y"]
    
    for fmt in date_formats:
        try:
            parsed_date = datetime.strptime(dob_only, fmt)
            break  # Stop trying if we get a successful parse
        except ValueError:
            continue

    if parsed_date:
        # Force the output to strictly be DDMMYYYY
        dob_clean = parsed_date.strftime("%d%m%Y")
    else:
        # Absolute fallback if some totally unknown string comes through
        dob_clean = dob_raw.replace("/", "").replace("-", "")[:8]

    return f"{dob_clean}_{last_4}"

@router.post("/login")
async def admin_login(body: dict, db=Depends(get_db)):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not password:
        raise HTTPException(400, "Username and password required")

    admin = await db.fetchrow("SELECT * FROM admins WHERE username = $1", username)
    if not admin or not verify_password(password, admin["password_hash"]):
        raise HTTPException(401, "Invalid credentials")

    token = create_token(
        {"sub": username, "role": admin["role"], "centre_id": admin["centre_id"]},
        expires_minutes=480,
    )
    return {"token": token, "role": admin["role"], "centre_id": admin["centre_id"], "username": username}


# @router.get("/students")
# async def get_all_students(
#     exam_id: int = None,
#     payload=Depends(verify_admin_token),
#     db=Depends(get_db),
# ):
#     # Resolve exam_id: default to the most recent active/draft exam
#     if exam_id is None:
#         row = await db.fetchrow(
#             "SELECT id FROM exams WHERE status IN ('active','draft') ORDER BY created_at DESC LIMIT 1"
#         )
#         if row:
#             exam_id = row["id"]

#     if payload["role"] == "invigilator":
#         rows = await db.fetch(
#             """SELECT s.id, s.roll_number, s.name_en, s.name_ar, s.stream, s.course,
#                       s.status, s.strikes, s.score, s.start_time, s.submit_time,
#                       s.paper_set, s.answers, s.strike_log, s.question_order,
#                       s.centre_id, s.exam_id, c.name_en as centre_name
#                FROM students s LEFT JOIN centres c ON s.centre_id = c.id
#                WHERE s.centre_id = $1
#                  AND ($2::int IS NULL OR s.exam_id = $2)
#                ORDER BY s.roll_number""",
#             payload["centre_id"], exam_id,
#         )
#     else:
#         rows = await db.fetch(
#             """SELECT s.id, s.roll_number, s.name_en, s.name_ar, s.stream, s.course,
#                       s.status, s.strikes, s.score, s.start_time, s.submit_time,
#                       s.paper_set, s.answers, s.strike_log, s.question_order,
#                       s.centre_id, s.exam_id, c.name_en as centre_name
#                FROM students s LEFT JOIN centres c ON s.centre_id = c.id
#                WHERE ($1::int IS NULL OR s.exam_id = $1)
#                ORDER BY s.centre_id, s.roll_number""",
#             exam_id,
#         )
#     result = []
#     for r in rows:
#         d = dict(r)
#         for field in ("answers", "strike_log", "question_order"):
#             if isinstance(d.get(field), str):
#                 d[field] = json.loads(d[field])
#         answers = d.get("answers") or {}
#         q_order = d.get("question_order") or []
#         d["answered_count"] = len([v for v in answers.values() if v])
#         d["total_questions"] = len(q_order)
#         result.append(d)
#     return result


@router.get("/students")
async def get_all_students(
    exam_id: int = None,
    payload=Depends(verify_admin_token),
    db=Depends(get_db),
):
    # Resolve exam_id: default to the most recent active/draft exam
    if exam_id is None:
        row = await db.fetchrow(
            "SELECT id FROM exams WHERE status IN ('active','draft') ORDER BY created_at DESC LIMIT 1"
        )
        if row:
            exam_id = row["id"]

    if payload["role"] == "invigilator":
        rows = await db.fetch(
            """SELECT s.id, s.roll_number, s.name_en, s.name_ar, s.stream, s.course,
                      s.status, s.strikes, s.score, s.start_time, s.submit_time,
                      s.paper_set, s.strike_log, s.question_order,
                      s.centre_id, s.exam_id, s.dob AS dob, s.phone AS phone, c.name_en as centre_name,
                      COALESCE((
                          SELECT jsonb_object_agg(sa.question_id::text, sa.answer_text)
                          FROM student_answers sa
                          WHERE sa.student_id = s.id
                      ), '{}'::jsonb) AS answers
               FROM students s LEFT JOIN centres c ON s.centre_id = c.id
               WHERE s.centre_id = $1
                 AND ($2::int IS NULL OR s.exam_id = $2)
               ORDER BY s.roll_number""",
            payload["centre_id"],
            exam_id,
        )
    else:
        rows = await db.fetch(
            """SELECT s.id, s.roll_number, s.name_en, s.name_ar, s.stream, s.course,
                      s.status, s.strikes, s.score, s.start_time, s.submit_time,
                      s.paper_set, s.strike_log, s.question_order,
                      s.centre_id, s.exam_id, s.dob AS dob, s.phone AS phone, c.name_en as centre_name,
                      COALESCE((
                          SELECT jsonb_object_agg(sa.question_id::text, sa.answer_text)
                          FROM student_answers sa
                          WHERE sa.student_id = s.id
                      ), '{}'::jsonb) AS answers
               FROM students s LEFT JOIN centres c ON s.centre_id = c.id
               WHERE ($1::int IS NULL OR s.exam_id = $1)
               ORDER BY s.centre_id, s.roll_number""",
            exam_id,
        )
    result = []
    for r in rows:
        d = dict(r)
        for field in ("answers", "strike_log", "question_order"):
            if isinstance(d.get(field), str):
                d[field] = json.loads(d[field])
        # asyncpg returns NUMERIC as Decimal; convert to float for orjson
        if d.get("score") is not None:
            d["score"] = float(d["score"])
        answers = d.get("answers") or {}
        q_order = d.get("question_order") or []
        d["answered_count"] = len([v for v in answers.values() if v])
        d["total_questions"] = len(q_order)
        result.append(d)
    return result


@router.post("/import")
async def import_students(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    """
    Accepts rows parsed by the frontend from Excel.
    Required columns: name_en, dob (DDMMYYYY), phone, stream, course, centre_id
    Optional: name_ar, exam_id (defaults to most recent active exam)
    Returns generated roll numbers and passwords.
    """
    rows = body.get("students", [])
    if not rows:
        raise HTTPException(400, "No student data provided")

    # Resolve exam_id
    exam_id = body.get("exam_id")
    if not exam_id:
        row = await db.fetchrow(
            "SELECT id FROM exams WHERE status IN ('active','draft') ORDER BY created_at DESC LIMIT 1"
        )
        exam_id = row["id"] if row else None
    if not exam_id:
        row = await db.fetchrow("SELECT id FROM exams ORDER BY created_at ASC LIMIT 1")
        exam_id = row["id"] if row else None

    # Load existing roll numbers to avoid collision
    existing = await db.fetch("SELECT roll_number FROM students")
    used_rolls = {r["roll_number"] for r in existing}

    # Balanced paper set assignment scoped to this exam
    counts = await db.fetch(
        "SELECT paper_set, COUNT(*) as cnt FROM students WHERE exam_id = $1 GROUP BY paper_set",
        exam_id,
    )
    set_counts = {"A": 0, "B": 0}
    for c in counts:
        if c["paper_set"] in set_counts:
            set_counts[c["paper_set"]] = c["cnt"]

    imported = []
    errors = []

    for i, row in enumerate(rows):
        name_en = str(row.get("name_en") or "").strip()
        dob = str(row.get("dob") or "").strip()
        phone = str(row.get("phone") or "").strip()
        stream = str(row.get("stream") or "general").strip().lower()
        course = str(row.get("course") or "UG").strip().upper()
        raw_centre = row.get("centre_id")
        centre_id = int(raw_centre) if raw_centre not in (None, "", 0) else None
        name_ar = str(row.get("name_ar") or "").strip()
        email = str(row.get("email") or "").strip()

        if not all([name_en, dob, phone]):
            errors.append({"row": i + 2, "error": "Missing required fields (name_en, dob, phone)"})
            continue

        try:
            roll = _roll_from_phone(phone)
            if not roll:
                errors.append({"row": i + 2, "error": "Could not parse phone number"})
                continue
            if roll in used_rolls:
                errors.append({"row": i + 2, "error": f"Duplicate phone/roll number: {roll}"})
                continue
            used_rolls.add(roll)
            password = _generate_password(dob, phone)

            paper_set = body.get("default_paper_set", "A")
            # If we want to be smarter, we could load all available sets and balance among them
            # but for now we'll stick to a simple default or the one provided in the row if we add mapping for it.
            
            # Check if row has a specific paper set
            row_set = str(row.get("paper_set") or "").strip().upper()
            if row_set:
                paper_set = row_set
            else:
                paper_set = "A" if set_counts.get("A", 0) <= set_counts.get("B", 0) else "B"
            
            set_counts[paper_set] = set_counts.get(paper_set, 0) + 1

            await db.execute(
                """INSERT INTO students
                   (exam_id, roll_number, password, name_en, name_ar, dob, phone, email,
                    stream, course, centre_id, paper_set)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                   ON CONFLICT (roll_number) DO NOTHING""",
                exam_id, roll, password, name_en, name_ar, dob, phone, email,
                stream, course, centre_id, paper_set,
            )
            imported.append({
                "roll_number": roll,
                "password": password,
                "name_en": name_en,
                "paper_set": paper_set,
                "stream": stream,
            })
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e)})

    return {"imported": len(imported), "errors": errors, "students": imported}


# @router.get("/results/export")
# async def export_results(payload=Depends(verify_superadmin_token), db=Depends(get_db)):
#     rows = await db.fetch(
#         """SELECT s.roll_number, s.name_en, s.name_ar, s.stream, s.course,
#                   c.name_en as centre, s.paper_set, s.status,
#                   s.score, s.strikes, s.start_time, s.submit_time,
#                   s.answers, s.strike_log
#            FROM students s LEFT JOIN centres c ON s.centre_id = c.id
#            ORDER BY s.centre_id, s.roll_number"""
#     )
#     result = []
#     for r in rows:
#         d = dict(r)
#         for field in ("answers", "strike_log"):
#             if isinstance(d.get(field), str):
#                 d[field] = json.loads(d[field])
#         for field in ("start_time", "submit_time"):
#             if d.get(field):
#                 d[field] = d[field].isoformat()
#         result.append(d)
#     return result


@router.get("/results/export")
async def export_results(payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    rows = await db.fetch(
        """SELECT s.id, s.roll_number, s.name_en, s.name_ar, s.stream, s.course,
                  s.dob AS dob, s.phone AS phone, c.name_en as centre, s.paper_set, s.status,
                  s.score, s.strikes, s.start_time, s.submit_time,
                  s.strike_log,
                  COALESCE((
                      SELECT jsonb_object_agg(sa.question_id::text, sa.answer_text)
                      FROM student_answers sa
                      WHERE sa.student_id = s.id
                  ), '{}'::jsonb) AS answers
           FROM students s LEFT JOIN centres c ON s.centre_id = c.id
           ORDER BY s.centre_id, s.roll_number"""
    )
    result = []
    for r in rows:
        d = dict(r)
        for field in ("answers", "strike_log"):
            if isinstance(d.get(field), str):
                d[field] = json.loads(d[field])
        for field in ("start_time", "submit_time"):
            if d.get(field):
                d[field] = d[field].isoformat()
        if d.get("score") is not None:
            d["score"] = float(d["score"])
        result.append(d)
    return result


@router.get("/centres")
async def list_centres(payload=Depends(verify_admin_token), db=Depends(get_db)):
    if payload["role"] == "invigilator" and payload.get("centre_id"):
        rows = await db.fetch(
            "SELECT id, name_en, name_ar, wifi_ssid, allowed_ip_ranges FROM centres WHERE id = $1",
            payload["centre_id"],
        )
    else:
        rows = await db.fetch(
            "SELECT id, name_en, name_ar, wifi_ssid, allowed_ip_ranges FROM centres ORDER BY id"
        )
    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("allowed_ip_ranges"), str):
            d["allowed_ip_ranges"] = json.loads(d["allowed_ip_ranges"])
        result.append(d)
    return result


@router.put("/centres/{centre_id}")
async def update_centre(centre_id: int, body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    name_en = (body.get("name_en") or "").strip()
    if not name_en:
        raise HTTPException(400, "Centre name required")
    
    await db.execute(
        """UPDATE centres SET
           name_en = $1, name_ar = $2, wifi_ssid = $3, allowed_ip_ranges = $4
           WHERE id = $5""",
        name_en,
        body.get("name_ar", ""),
        body.get("wifi_ssid", ""),
        json.dumps(body.get("allowed_ip_ranges", [])),
        centre_id,
    )
    return {"updated": True}


@router.delete("/centres/{centre_id}")
async def delete_centre(centre_id: int, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    # Check if students are assigned to this centre
    in_use = await db.fetchval("SELECT COUNT(*) FROM students WHERE centre_id = $1", centre_id)
    if in_use:
        raise HTTPException(400, f"Cannot delete: {in_use} student(s) still assigned to this centre")
    
    await db.execute("DELETE FROM centres WHERE id = $1", centre_id)
    return {"deleted": True}


@router.post("/centres")
async def create_centre(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    name_en = (body.get("name_en") or "").strip()
    if not name_en:
        raise HTTPException(400, "Centre name required")
    row = await db.fetchrow(
        """INSERT INTO centres (name_en, name_ar, wifi_ssid, allowed_ip_ranges)
           VALUES ($1, $2, $3, $4) RETURNING id""",
        name_en,
        body.get("name_ar", ""),
        body.get("wifi_ssid", ""),
        json.dumps(body.get("allowed_ip_ranges", [])),
    )
    return {"id": row["id"], "name_en": name_en}


@router.post("/admins")
async def create_admin(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role = body.get("role", "invigilator")
    centre_id = body.get("centre_id")

    if not username or not password:
        raise HTTPException(400, "Username and password required")
    if role not in ("admin", "invigilator"):
        raise HTTPException(400, "Role must be admin or invigilator")

    await db.execute(
        """INSERT INTO admins (username, password_hash, role, centre_id)
           VALUES ($1, $2, $3, $4)""",
        username,
        hash_password(password),
        role,
        centre_id,
    )
    return {"created": True, "username": username}


@router.get("/streams")
async def list_streams(payload=Depends(verify_admin_token), db=Depends(get_db)):
    rows = await db.fetch("SELECT id, name FROM streams ORDER BY name")
    return [dict(r) for r in rows]


@router.post("/streams")
async def create_stream(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    name = (body.get("name") or "").strip().lower()
    if not name:
        raise HTTPException(400, "Stream name required")
    try:
        row = await db.fetchrow(
            "INSERT INTO streams (name) VALUES ($1) RETURNING id, name", name
        )
    except Exception:
        raise HTTPException(409, "Stream already exists")
    return dict(row)


@router.put("/streams/{stream_id}")
async def update_stream(stream_id: int, body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    name = (body.get("name") or "").strip().lower()
    if not name:
        raise HTTPException(400, "Stream name required")
    row = await db.fetchrow(
        "UPDATE streams SET name = $1 WHERE id = $2 RETURNING id, name", name, stream_id
    )
    if not row:
        raise HTTPException(404, "Stream not found")
    return dict(row)


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: int, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    in_use = await db.fetchval(
        "SELECT COUNT(*) FROM students WHERE stream = (SELECT name FROM streams WHERE id = $1)", stream_id
    )
    if in_use:
        raise HTTPException(400, f"Stream in use by {in_use} student(s)")
    await db.execute("DELETE FROM streams WHERE id = $1", stream_id)
    return {"deleted": True}


@router.get("/sets")
async def list_sets(payload=Depends(verify_admin_token), db=Depends(get_db)):
    rows = await db.fetch("SELECT id, name FROM sets ORDER BY name")
    return [dict(r) for r in rows]


@router.post("/sets")
async def create_set(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    name = (body.get("name") or "").strip().upper()
    if not name:
        raise HTTPException(400, "Set name required")
    try:
        row = await db.fetchrow(
            "INSERT INTO sets (name) VALUES ($1) RETURNING id, name", name
        )
    except Exception:
        raise HTTPException(409, "Set already exists")
    return dict(row)


@router.put("/sets/{set_id}")
async def update_set(set_id: int, body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    name = (body.get("name") or "").strip().upper()
    if not name:
        raise HTTPException(400, "Set name required")
    row = await db.fetchrow(
        "UPDATE sets SET name = $1 WHERE id = $2 RETURNING id, name", name, set_id
    )
    if not row:
        raise HTTPException(404, "Set not found")
    return dict(row)


@router.delete("/sets/{set_id}")
async def delete_set(set_id: int, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    in_use = await db.fetchval(
        "SELECT COUNT(*) FROM students WHERE paper_set = (SELECT name FROM sets WHERE id = $1)", set_id
    )
    if in_use:
        raise HTTPException(400, f"Set in use by {in_use} student(s)")
    
    in_use_q = await db.fetchval(
        "SELECT COUNT(*) FROM questions q JOIN papers p ON q.paper_id = p.id WHERE p.set_code = (SELECT name FROM sets WHERE id = $1)", set_id
    )
    if in_use_q:
        raise HTTPException(400, f"Set in use by {in_use_q} question(s)")

    await db.execute("DELETE FROM sets WHERE id = $1", set_id)
    return {"deleted": True}


@router.post("/students")
async def create_student(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    """Manually create a single student."""
    name_en = str(body.get("name_en") or "").strip()
    dob = str(body.get("dob") or "").strip()
    phone = str(body.get("phone") or "").strip()
    stream = str(body.get("stream") or "general").strip().lower()
    course = str(body.get("course") or "UG").strip().upper()
    name_ar = str(body.get("name_ar") or "").strip()
    email = str(body.get("email") or "").strip()
    raw_centre = body.get("centre_id")
    centre_id = int(raw_centre) if raw_centre not in (None, "", 0) else None
    paper_set = str(body.get("paper_set") or "A").strip().upper()
    exam_id = body.get("exam_id")

    if not all([name_en, dob, phone]):
        raise HTTPException(400, "name_en, dob, and phone are required")

    if not exam_id:
        row = await db.fetchrow(
            "SELECT id FROM exams WHERE status IN ('active','draft') ORDER BY created_at DESC LIMIT 1"
        )
        exam_id = row["id"] if row else None

    roll = _roll_from_phone(phone)
    if not roll:
        raise HTTPException(400, "Could not parse phone number")

    existing = await db.fetchrow("SELECT roll_number FROM students WHERE roll_number = $1", roll)
    if existing:
        raise HTTPException(409, f"Student with roll number {roll} already exists")

    password = _generate_password(dob, phone)

    await db.execute(
        """INSERT INTO students
           (exam_id, roll_number, password, name_en, name_ar, dob, phone, email,
            stream, course, centre_id, paper_set)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
        exam_id, roll, password, name_en, name_ar, dob, phone, email,
        stream, course, centre_id, paper_set,
    )
    return {"roll_number": roll, "password": password, "name_en": name_en, "paper_set": paper_set}


@router.put("/students/{roll_number}")
async def update_student(roll_number: str, body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    """Update student information."""
    roll = roll_number.upper()
    student = await db.fetchrow("SELECT * FROM students WHERE roll_number = $1", roll)
    if not student:
        raise HTTPException(404, "Student not found")

    name_en = str(body.get("name_en") if "name_en" in body else student["name_en"]).strip()
    name_ar = str(body.get("name_ar") if "name_ar" in body else student["name_ar"]).strip()
    dob = str(body.get("dob") if "dob" in body else student["dob"]).strip()
    phone = str(body.get("phone") if "phone" in body else student["phone"]).strip()
    stream = str(body.get("stream") if "stream" in body else student["stream"]).strip().lower()
    course = str(body.get("course") if "course" in body else student["course"]).strip().upper()
    email = str(body.get("email") if "email" in body else student["email"]).strip()
    
    raw_centre = body.get("centre_id") if "centre_id" in body else student["centre_id"]
    centre_id = int(raw_centre) if raw_centre not in (None, "", 0) else None
    
    paper_set = str(body.get("paper_set") if "paper_set" in body else student["paper_set"]).strip().upper()


    new_roll = roll
    new_password = student["password"]

    # If phone changed, re-calculate roll number
    if phone != student["phone"]:
        from routers.admin import _roll_from_phone
        new_roll = _roll_from_phone(phone)
        # Check collision
        colliding = await db.fetchrow("SELECT roll_number FROM students WHERE roll_number = $1 AND id != $2", new_roll, student["id"])
        if colliding:
            raise HTTPException(409, f"Roll number {new_roll} (from new phone) already in use")

    # If phone or DOB changed, re-calculate password
    if phone != student["phone"] or dob != student["dob"]:
        from routers.admin import _generate_password
        new_password = _generate_password(dob, phone)

    await db.execute(
        """UPDATE students SET
           name_en = $1, name_ar = $2, dob = $3, phone = $4,
           stream = $5, course = $6, email = $7, centre_id = $8,
           paper_set = $9, roll_number = $10, password = $11
           WHERE id = $12""",
        name_en, name_ar, dob, phone,
        stream, course, email, centre_id,
        paper_set, new_roll, new_password,
        student["id"]
    )

    # Clear cache for BOTH old and new roll
    _QUESTION_CACHE.pop(roll, None)
    _QUESTION_CACHE.pop(new_roll, None)

    return {"updated": True, "roll_number": new_roll}


@router.get("/students/{roll_number}/password")
async def get_student_password(roll_number: str, payload=Depends(verify_admin_token), db=Depends(get_db)):
    row = await db.fetchrow(
        "SELECT password FROM students WHERE roll_number = $1", roll_number.upper()
    )
    if not row:
        raise HTTPException(404, "Student not found")
    return {"password": row["password"]}


@router.delete("/students/{roll_number}")
async def delete_student(roll_number: str, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    result = await db.execute(
        "DELETE FROM students WHERE roll_number = $1", roll_number.upper()
    )
    if result == "DELETE 0":
        raise HTTPException(404, "Student not found")
    return {"deleted": True}


@router.delete("/students")
async def bulk_delete_students(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    rolls = [str(r).upper() for r in body.get("rolls", [])]
    if not rolls:
        raise HTTPException(400, "rolls required")
    result = await db.execute(
        "DELETE FROM students WHERE roll_number = ANY($1::text[])", rolls
    )
    deleted = int(result.split()[-1]) if result else 0
    return {"deleted": deleted}


@router.get("/students/{roll_number}/answer-timeline")
async def get_answer_timeline(roll_number: str, payload=Depends(verify_admin_token), db=Depends(get_db)):
    """Returns per-question answer timestamps for a student — used for the Timeline tab."""
    student = await db.fetchrow(
        "SELECT id, start_time FROM students WHERE roll_number = $1", roll_number.upper()
    )
    if not student:
        raise HTTPException(404, "Student not found")

    rows = await db.fetch(
        """SELECT sa.question_id, sa.answer_text, sa.updated_at,
                  q.section, q.question_number, q.type
           FROM student_answers sa
           JOIN questions q ON q.id = sa.question_id
           WHERE sa.student_id = $1
           ORDER BY sa.updated_at ASC""",
        student["id"],
    )
    return {
        "start_time": student["start_time"].isoformat() if student["start_time"] else None,
        "answers": [
            {
                "question_id": r["question_id"],
                "section": r["section"],
                "question_number": r["question_number"],
                "type": r["type"],
                "answer": r["answer_text"],
                "answered_at": r["updated_at"].isoformat(),
            }
            for r in rows
        ],
    }


@router.post("/students/{roll_number}/grade")
async def grade_student(roll_number: str, body: dict, payload=Depends(verify_admin_token), db=Depends(get_db)):
    score = body.get("score")
    if score is None:
        raise HTTPException(400, "score required")
    result = await db.execute(
        "UPDATE students SET score = $1 WHERE UPPER(roll_number) = $2",
        float(score), roll_number.strip().upper(),
    )
    if result == "UPDATE 0":
        raise HTTPException(404, "Student not found")
    return {"updated": True}


@router.post("/students/{roll_number}/assign-exam")
async def assign_exam(roll_number: str, body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    """Move a student to a different exam. Student must be pending (not mid-exam)."""
    exam_id = body.get("exam_id")
    if not exam_id:
        raise HTTPException(400, "exam_id required")
    exam = await db.fetchrow("SELECT id FROM exams WHERE id = $1", int(exam_id))
    if not exam:
        raise HTTPException(404, "Exam not found")
    result = await db.execute(
        "UPDATE students SET exam_id = $1 WHERE roll_number = $2 AND status = 'pending'",
        int(exam_id), roll_number.upper(),
    )
    if result == "UPDATE 0":
        # Could be not found OR already active/submitted
        student = await db.fetchrow("SELECT status FROM students WHERE roll_number = $1", roll_number.upper())
        if not student:
            raise HTTPException(404, "Student not found")
        raise HTTPException(409, f"Cannot reassign: student is {student['status']}. Reset first.")
    return {"assigned": True, "exam_id": int(exam_id)}


@router.post("/students/{roll_number}/reset")
async def reset_student(roll_number: str, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    """Reset a student's exam so they can retake."""
    roll = roll_number.upper()
    await db.execute(
        """UPDATE students
           SET status = 'pending', strikes = 0, strike_log = '[]',
               start_time = NULL, submit_time = NULL,
               question_order = '[]', answers = '{}', score = 0,
               current_section = 1, section_start_time = NULL
           WHERE roll_number = $1""",
        roll,
    )
    await db.execute(
        """DELETE FROM student_answers
           WHERE student_id = (SELECT id FROM students WHERE roll_number = $1)""",
        roll,
    )
    _QUESTION_CACHE.pop(roll, None)
    return {"reset": True}


@router.post("/students/{roll_number}/reopen")
async def reopen_student(roll_number: str, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    """Reopen a submitted student's exam so they can continue from where they left off.

    Preserves all existing answers, question order, and strike count.
    Only clears submit_time and restores status to 'active'.
    """
    roll = roll_number.upper()
    updated = await db.fetchval(
        """UPDATE students
           SET status = 'active', submit_time = NULL
           WHERE roll_number = $1 AND status = 'submitted'
           RETURNING id""",
        roll,
    )
    if not updated:
        raise HTTPException(400, "Student is not in submitted state or not found")
    from routers.ws import broadcast
    await broadcast({"type": "status_change", "roll": roll, "status": "active"})
    return {"reopened": True}
