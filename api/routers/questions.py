import json
import io
import re
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from auth import verify_admin_token, verify_superadmin_token
from database import get_db

try:
    import pytesseract
    from PIL import Image
except ImportError:
    pytesseract = None
    Image = None

router = APIRouter()


def _normalize_stream(stream_val) -> str | None:
    if stream_val is None:
        return None
    s = str(stream_val).strip()
    return None if s == "" else s


@router.get("")
async def list_questions(
    paper_set: str | None = None,
    section: int | None = None,
    stream: str | None = None,
    payload=Depends(verify_admin_token),
    db=Depends(get_db),
):
    conditions, params = [], []
    if paper_set:
        params.append(paper_set.upper())
        conditions.append(f"p.set_code = ${len(params)}")
    if section is not None:
        params.append(section)
        conditions.append(f"q.section = ${len(params)}")
    if stream is not None:
        if stream == "all":
            conditions.append("COALESCE(q.stream, '') = ''")
        else:
            params.append(stream)
            conditions.append(f"q.stream = ${len(params)}")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = await db.fetch(
        f"SELECT q.*, p.set_code as paper_set FROM questions q JOIN papers p ON q.paper_id = p.id {where} ORDER BY p.set_code, q.section, q.question_number",
        *params,
    )
    results = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("options_en"), str):
            try:
                d["options_en"] = json.loads(d["options_en"])
            except json.JSONDecodeError:
                d["options_en"] = ["", "", "", ""]
                
        if isinstance(d.get("options_ar"), str):
            try:
                d["options_ar"] = json.loads(d["options_ar"])
            except json.JSONDecodeError:
                d["options_ar"] = ["", "", "", ""]
                
        results.append(d)
        
    return results


@router.post("")
async def create_question(
    body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)
):
    paper_set = (body.get("paper_set") or "A").upper()
    # Defaulting to the 'DEFAULT' exam if no exam context is provided, 
    # similar to bulk import, until full multi-exam support is added to the UI.
    default_exam_id = await db.fetchval("SELECT id FROM exams WHERE code = 'DEFAULT' LIMIT 1")
    paper = await db.fetchrow(
        "SELECT id FROM papers WHERE exam_id = $1 AND set_code = $2", 
        default_exam_id, paper_set
    )
    if not paper:
        # Auto-create paper if missing for the default exam
        paper_id = await db.fetchval(
            "INSERT INTO papers (exam_id, set_code, name_en) VALUES ($1, $2, $3) RETURNING id",
            default_exam_id, paper_set, f"Paper Set {paper_set}"
        )
    else:
        paper_id = paper["id"]

    section = body.get("section", 1)
    q_num = body.get("question_number") or (
        await db.fetchval(
            "SELECT COALESCE(MAX(question_number), 0) FROM questions WHERE paper_id = $1 AND section = $2",
            paper_id,
            section,
        )
        + 1
    )
    stream = _normalize_stream(body.get("stream"))

    row = await db.fetchrow(
        """INSERT INTO questions (paper_id, section, question_number, type, language, question_en, question_ar, options_en, options_ar, correct_answer, marks, stream)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12) RETURNING id""",
        paper_id,
        section,
        q_num,
        body.get("type"),
        body.get("language", "both"),
        body.get("question_en", ""),
        body.get("question_ar", ""),
        json.dumps(body.get("options_en", [])),
        json.dumps(body.get("options_ar", [])),
        body.get("correct_answer", ""),
        body.get("marks", 1),
        stream,
    )
    return {"id": row["id"], "question_number": q_num}


@router.put("/{q_id}")
async def update_question(
    q_id: int, body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)
):
    # Determine the paper_id if paper_set is changing
    paper_set = body.get("paper_set")
    paper_id = None
    if paper_set:
        paper_set = paper_set.upper()
        # Find paper within the same exam context as the current question
        exam_id = await db.fetchval(
            "SELECT p.exam_id FROM questions q JOIN papers p ON q.paper_id = p.id WHERE q.id = $1",
            q_id
        )
        if exam_id:
            paper_id = await db.fetchval(
                "SELECT id FROM papers WHERE exam_id = $1 AND set_code = $2",
                exam_id, paper_set
            )

    # Capture choices if provided
    opts_en = body.get("options_en")
    opts_ar = body.get("options_ar")

    await db.execute(
        """UPDATE questions SET 
           type=COALESCE($1,type), 
           language=COALESCE($2,language), 
           question_en=COALESCE($3,question_en), 
           question_ar=COALESCE($4,question_ar), 
           correct_answer=COALESCE($5,correct_answer), 
           marks=COALESCE($6,marks), 
           stream=$7,
           section=COALESCE($8,section),
           paper_id=COALESCE($9,paper_id),
           options_en=COALESCE($10::jsonb,options_en),
           options_ar=COALESCE($11::jsonb,options_ar)
           WHERE id=$12""",
        body.get("type"),
        body.get("language"),
        body.get("question_en"),
        body.get("question_ar"),
        body.get("correct_answer"),
        body.get("marks"),
        _normalize_stream(body.get("stream")),
        body.get("section"),
        paper_id,
        json.dumps(opts_en) if opts_en is not None else None,
        json.dumps(opts_ar) if opts_ar is not None else None,
        q_id,
    )
    return {"updated": True}


@router.delete("/{q_id}")
async def delete_question(
    q_id: int, payload=Depends(verify_superadmin_token), db=Depends(get_db)
):
    await db.execute("DELETE FROM questions WHERE id = $1", q_id)
    return {"deleted": True}


@router.post("/bulk")
async def bulk_import_questions(
    questions: List[Dict[str, Any]],
    payload=Depends(verify_superadmin_token),
    db=Depends(get_db),
):
    print(f"DEBUG: Starting bulk import of {len(questions)} questions")
    inserted, errors, paper_cache = 0, [], {}
    default_exam_id = await db.fetchval(
        "SELECT id FROM exams WHERE code = 'DEFAULT' LIMIT 1"
    )
    if not default_exam_id:
        print("DEBUG: DEFAULT exam not found")
        # Find any exam if DEFAULT is missing
        default_exam_id = await db.fetchval("SELECT id FROM exams LIMIT 1")
        print(f"DEBUG: Using fallback exam_id: {default_exam_id}")

    for i, q in enumerate(questions):
        try:
            p_set = (q.get("paper_set") or "A").upper()
            if p_set not in paper_cache:
                p_row = await db.fetchrow(
                    """INSERT INTO papers (exam_id, set_code, name_en, name_ar)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (exam_id, set_code) DO UPDATE SET set_code = EXCLUDED.set_code
                       RETURNING id""",
                    default_exam_id,
                    p_set,
                    f"Paper Set {p_set}",
                    f"المجموعة {p_set}",
                )
                paper_cache[p_set] = p_row["id"]
            paper_id = paper_cache[p_set]
            section = int(q.get("section", 1))
            stream = _normalize_stream(q.get("stream"))
            q_num = q.get("question_number")
            if not q_num:
                q_num = await db.fetchval(
                    """SELECT COALESCE(MAX(question_number), 0) + 1
                       FROM questions
                       WHERE paper_id = $1 AND section = $2
                         AND COALESCE(stream, '') = $3""",
                    paper_id, section, stream or "",
                )
            await db.execute(
                """INSERT INTO questions
                   (paper_id, section, question_number, type, language,
                    question_en, question_ar, options_en, options_ar,
                    correct_answer, marks, stream)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)""",
                paper_id,
                section,
                int(q_num),
                q.get("type", "mcq"),
                q.get("language", "both"),
                q.get("question_en", ""),
                q.get("question_ar", ""),
                json.dumps(q.get("options_en") or [""] * 4),
                json.dumps(q.get("options_ar") or [""] * 4),
                q.get("correct_answer", ""),
                q.get("marks", 1),
                stream,
            )
            inserted += 1
        except Exception as e:
            print(f"DEBUG: Error in row {i+1}: {e}")
            errors.append({"row": i + 1, "error": str(e)})
    
    print(f"DEBUG: Bulk import complete. Inserted: {inserted}, Errors: {len(errors)}")
    return {"inserted": inserted, "errors": errors}


def parse_tesseract_output(text: str) -> list:
    text = re.sub(r"\s+([b-d])[\.\)]\s+", r"\n\1. ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+([بجد])[\.\)]\s+", r"\n\1. ", text)
    lines, questions, current_q = text.split("\n"), [], None
    q_pattern = re.compile(r"^(\d+)[\.\)]\s+(.+)")
    opt_pattern = re.compile(r"^([a-dأ-دبجد])[\.\)]\s+(.+)", re.IGNORECASE)
    for line in lines:
        line = line.strip()
        if not line:
            continue
        q_match = q_pattern.match(line)
        if q_match:
            if current_q:
                if current_q["current_opt_text"]:
                    current_q["options"].append(current_q["current_opt_text"])
                questions.append(current_q)
            current_q = {
                "question_text": q_match.group(2),
                "options": [],
                "current_opt_text": "",
                "current_opt_key": None,
            }
            continue
        if current_q:
            opt_match = opt_pattern.match(line)
            if opt_match:
                if current_q["current_opt_text"]:
                    current_q["options"].append(current_q["current_opt_text"])
                current_q["current_opt_text"], current_q["current_opt_key"] = (
                    opt_match.group(2),
                    opt_match.group(1),
                )
            else:
                if current_q["current_opt_key"]:
                    current_q["current_opt_text"] += " " + line
                else:
                    current_q["question_text"] += " " + line
    if current_q:
        if current_q["current_opt_text"]:
            current_q["options"].append(current_q["current_opt_text"])
        questions.append(current_q)
    return [
        {
            "type": "mcq",
            "question_en": (
                ""
                if any("\u0600" <= c <= "\u06ff" for c in q["question_text"])
                else q["question_text"]
            ),
            "question_ar": (
                q["question_text"]
                if any("\u0600" <= c <= "\u06ff" for c in q["question_text"])
                else ""
            ),
            "options_en": (
                q["options"]
                if not any("\u0600" <= c <= "\u06ff" for c in q["question_text"])
                else [""] * 4
            ),
            "options_ar": (
                q["options"]
                if any("\u0600" <= c <= "\u06ff" for c in q["question_text"])
                else [""] * 4
            ),
            "correct_answer": "",
            "language": (
                "ar"
                if any("\u0600" <= c <= "\u06ff" for c in q["question_text"])
                else "en"
            ),
            "marks": 1,
        }
        for q in questions
    ]


@router.post("/extract")
async def extract_from_image(
    file: UploadFile = File(...), payload=Depends(verify_superadmin_token)
):
    if not pytesseract:
        raise HTTPException(500, "Tesseract not installed")
    content = await file.read()
    image = Image.open(io.BytesIO(content))
    text = pytesseract.image_to_string(image, lang="eng+ara")
    parsed = parse_tesseract_output(text)
    return {"questions": parsed, "count": len(parsed)}
