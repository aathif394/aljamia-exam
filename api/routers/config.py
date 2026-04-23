import json
from fastapi import APIRouter, HTTPException, Depends
from auth import verify_admin_token, verify_superadmin_token
from database import get_db

router = APIRouter()


@router.get("")
async def get_config(payload=Depends(verify_admin_token), db=Depends(get_db)):
    cfg = await db.fetchrow("SELECT * FROM exam_config WHERE id = 1")
    if not cfg:
        raise HTTPException(500, "Config not initialized")
    d = dict(cfg)
    if d.get("exam_start_time"):
        d["exam_start_time"] = d["exam_start_time"].isoformat()
    if d.get("updated_at"):
        d["updated_at"] = d["updated_at"].isoformat()
    if isinstance(d.get("allowed_ip_ranges"), str):
        d["allowed_ip_ranges"] = json.loads(d["allowed_ip_ranges"])
    return d


@router.put("")
async def update_config(body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    from datetime import datetime, timezone

    start_time = body.get("exam_start_time")
    if start_time:
        try:
            start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(400, "Invalid exam_start_time format (use ISO 8601)")

    await db.execute(
        """UPDATE exam_config SET
           exam_start_time = COALESCE($1, exam_start_time),
           exam_duration_minutes = COALESCE($2, exam_duration_minutes),
           enable_ip_check = COALESCE($3, enable_ip_check),
           allowed_ip_ranges = COALESCE($4::jsonb, allowed_ip_ranges),
           test_mode = COALESCE($5, test_mode),
           updated_at = NOW()
           WHERE id = 1""",
        start_time,
        body.get("exam_duration_minutes"),
        body.get("enable_ip_check"),
        json.dumps(body["allowed_ip_ranges"]) if "allowed_ip_ranges" in body else None,
        body.get("test_mode"),
    )
    return {"updated": True}
