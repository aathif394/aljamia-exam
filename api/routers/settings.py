"""
App settings router — manages global configuration (Resend email, etc.)
All endpoints require super-admin privileges.
"""
import json
from fastapi import APIRouter, Depends
from auth import verify_superadmin_token
from database import get_db

router = APIRouter()


@router.get("")
async def get_settings(payload=Depends(verify_superadmin_token), db=Depends(get_db)):
    """Return all app settings as a flat key→value dict."""
    rows = await db.fetch("SELECT key, value FROM app_settings ORDER BY key")
    return {r["key"]: r["value"] for r in rows}


@router.put("")
async def update_settings(
    body: dict, payload=Depends(verify_superadmin_token), db=Depends(get_db)
):
    """Upsert one or more settings keys."""
    for key, value in body.items():
        await db.execute(
            """INSERT INTO app_settings (key, value, updated_at)
               VALUES ($1, $2::jsonb, NOW())
               ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()""",
            key,
            json.dumps(value),
        )
    return {"updated": True}
