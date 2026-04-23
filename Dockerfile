FROM python:3.12-slim

# tesseract is required by pytesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Use uv for fast dependency install
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Cache dependency install layer
COPY api/pyproject.toml api/uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source
COPY api/ .

# Frontend dist is referenced as ../frontend/dist relative to main.py
# main.py lives at /app/main.py, so ../frontend/dist = /frontend/dist
COPY frontend/dist/ /frontend/dist/

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1"]
