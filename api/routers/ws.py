import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from auth import SECRET_KEY, ALGORITHM

router = APIRouter()

dashboard_clients: list[WebSocket] = []
student_clients: dict[str, WebSocket] = {}

# Pending auto-submit tasks keyed by roll number.
# Cancelled when student reconnects within the grace window.
_pending_auto_submit: dict[str, asyncio.Task] = {}
DISCONNECT_GRACE_SECONDS = 120


async def broadcast(data: dict) -> None:
    """Send a message to all connected dashboard clients."""
    message = json.dumps(data)
    dead = []
    for ws in list(dashboard_clients):
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in dashboard_clients:
            dashboard_clients.remove(ws)


async def _auto_submit_on_disconnect(roll: str, student_id: int) -> None:
    """Submit the student's exam automatically when they disconnect mid-exam.

    Safe to call multiple times — the DB UPDATE is a no-op if the student is
    already submitted/flagged.  Uses the shared pool so no connection is leaked.
    """
    from database import db_pool
    from routers.exam import _calculate_score

    if db_pool is None:
        return
    try:
        async with db_pool.acquire() as db:
            student = await db.fetchrow(
                "SELECT id, status, answers, question_order FROM students WHERE id = $1",
                student_id,
            )
            if not student or student["status"] not in ("active", "flagged"):
                return

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

            score = await _calculate_score(db, answers, q_order, roll)
            now = datetime.now(timezone.utc)

            updated = await db.fetchval(
                """UPDATE students
                   SET status = 'submitted', submit_time = $1, score = $2
                   WHERE id = $3 AND status IN ('active', 'flagged')
                   RETURNING id""",
                now, score, student_id,
            )
            if updated:
                await broadcast({
                    "type": "submitted",
                    "roll": roll,
                    "score": float(score),
                    "auto": True,
                })
    except Exception:
        pass


async def _schedule_auto_submit(roll: str, student_id: int) -> None:
    """Wait for grace period then auto-submit. Cancelled if student reconnects."""
    try:
        await asyncio.sleep(DISCONNECT_GRACE_SECONDS)
        _pending_auto_submit.pop(roll, None)
        await _auto_submit_on_disconnect(roll, student_id)
    except asyncio.CancelledError:
        pass


@router.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") not in ("admin", "invigilator"):
            await websocket.close(code=1008)
            return
    except JWTError:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    dashboard_clients.append(websocket)
    try:
        while True:
            # Keep the connection alive; no inbound messages needed from dashboard
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in dashboard_clients:
            dashboard_clients.remove(websocket)


@router.websocket("/ws/student")
async def student_ws(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "student":
            await websocket.close(code=1008)
            return
        roll = payload["sub"]
        student_id = payload.get("student_id")
    except JWTError:
        await websocket.close(code=1008)
        return

    await websocket.accept()

    # Cancel any pending auto-submit from a previous disconnect
    pending = _pending_auto_submit.pop(roll, None)
    if pending:
        pending.cancel()

    student_clients[roll] = websocket
    disconnect_code = 1000  # assume normal until we know otherwise
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "viewing":
                    await broadcast({
                        "type": "student_viewing",
                        "roll": roll,
                        "question_index": msg.get("question_index", 0),
                    })
            except Exception:
                pass
    except WebSocketDisconnect as e:
        disconnect_code = e.code
        await broadcast({
            "type": "student_disconnect",
            "roll": roll,
            "code": e.code,
            "reason": _disconnect_reason(e.code),
        })
    finally:
        student_clients.pop(roll, None)
        # Schedule auto-submit after grace period so brief network drops don't
        # lose the student's exam. Code 1000 = clean submit/logout — skip.
        if disconnect_code != 1000 and student_id:
            task = asyncio.create_task(_schedule_auto_submit(roll, student_id))
            _pending_auto_submit[roll] = task


def _disconnect_reason(code: int) -> str:
    return {
        1000: "Normal closure",
        1001: "Browser closed or navigated away",
        1006: "Connection lost (network issue or browser crash)",
        1008: "Policy violation",
        1011: "Server error",
    }.get(code, f"Unexpected disconnection (code {code})")
