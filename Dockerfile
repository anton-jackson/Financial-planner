# Combined Dockerfile for Cloud Run (single container).
#
# Builds the React frontend, then serves it via the Python backend.
# For local development, use docker-compose.yaml instead (separate containers).

# ─── Stage 1: Build frontend ────────────────────────────────────────

FROM node:22-slim AS frontend-build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ─── Stage 2: Python backend + static files ─────────────────────────

FROM python:3.13-slim

WORKDIR /app

# Install dependencies first (layer caching)
RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.30" \
    "pydantic>=2.0" \
    "pyyaml>=6.0" \
    "numpy>=1.26" \
    "scipy>=1.12" \
    "pandas>=2.1" \
    "python-multipart>=0.0.9" \
    "anthropic>=0.40"

# Copy backend code
COPY backend/ .

# Copy built frontend into static/
COPY --from=frontend-build /app/dist /app/static

# Create data directory (overridden by GCS volume mount in Cloud Run)
RUN mkdir -p /app/data/results /app/data/scenarios /app/data/agent_sandbox

ENV DATA_DIR=/app/data
ENV PYTHONUNBUFFERED=1
ENV STATIC_DIR=/app/static

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
