import asyncio
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from database import init_db, close_db
from routers import students, exam, admin, questions, config, ws
from routers import exams as exams_router
from routers import settings as settings_router
from scheduler import run_scheduler


import logging

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Start results-notification scheduler in background
    scheduler_task = asyncio.create_task(_start_scheduler())
    yield
    scheduler_task.cancel()
    await close_db()


async def _start_scheduler():
    """Wait for DB pool to be ready then run the scheduler loop."""
    import database
    for _ in range(10):
        if database.db_pool is not None:
            break
        await asyncio.sleep(1)
    if database.db_pool:
        await run_scheduler(database.db_pool)


# ── In-memory sliding-window rate limiter ─────────────────────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window rate limiter.
    - Login endpoints: 15 requests / 60 s per IP  (brute-force protection)
    - WebSocket endpoints: not rate-limited (long-lived connections)
    - Everything else: 120 requests / 60 s per IP
    """
    LOGIN_PATHS   = {"/api/students/login", "/api/admin/login"}
    WS_PREFIX     = "/ws/"
    LOGIN_LIMIT   = 1000   # Allows all 500 to login within a minute
    GENERAL_LIMIT = 15000
    WINDOW        = 60  # seconds

    def __init__(self, app):
        super().__init__(app)
        self._store: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.monotonic()

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _cleanup(self) -> None:
        """Periodically remove expired entries to bound memory."""
        now = time.monotonic()
        if now - self._last_cleanup < 120:
            return
        cutoff = now - self.WINDOW
        for key in list(self._store):
            self._store[key] = [t for t in self._store[key] if t > cutoff]
            if not self._store[key]:
                del self._store[key]
        self._last_cleanup = now

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip rate-limiting for WebSocket upgrades
        if path.startswith(self.WS_PREFIX):
            return await call_next(request)

        is_login = path in self.LOGIN_PATHS
        limit = self.LOGIN_LIMIT if is_login else self.GENERAL_LIMIT

        ip  = self._client_ip(request)
        key = f"{ip}:{'login' if is_login else 'api'}"
        now = time.monotonic()

        self._cleanup()

        # Slide the window
        window_start = now - self.WINDOW
        self._store[key] = [t for t in self._store[key] if t > window_start]

        if len(self._store[key]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down and try again."},
                headers={"Retry-After": str(self.WINDOW)},
            )

        self._store[key].append(now)
        return await call_next(request)


app = FastAPI(title="Exam System API", lifespan=lifespan, default_response_class=ORJSONResponse)

# Rate limiter must come before CORS so rejected requests still get CORS headers
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(students.router,        prefix="/api/students",  tags=["students"])
app.include_router(exam.router,            prefix="/api/exam",      tags=["exam"])
app.include_router(admin.router,           prefix="/api/admin",     tags=["admin"])
app.include_router(questions.router,       prefix="/api/questions", tags=["questions"])
app.include_router(config.router,          prefix="/api/config",    tags=["config"])
app.include_router(exams_router.router,    prefix="/api/exams",     tags=["exams"])
app.include_router(settings_router.router, prefix="/api/settings",  tags=["settings"])
app.include_router(ws.router)

# Serve built React app; falls back gracefully if dist doesn't exist yet
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Check if the requested path corresponds to a real file in frontend/dist
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        # Fallback to SPA index
        return FileResponse(os.path.join(frontend_dist, "index.html"))
