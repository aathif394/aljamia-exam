import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from auth import SECRET_KEY, ALGORITHM

router = APIRouter()

dashboard_clients: list[WebSocket] = []


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
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in dashboard_clients:
            dashboard_clients.remove(websocket)
