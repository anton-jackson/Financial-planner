import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import CORS_ORIGINS
from api.router import router

app = FastAPI(title="Finance Planner", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


# Serve frontend static files in single-container mode (Cloud Run).
# In dev mode (STATIC_DIR not set), frontend is served by Vite.
STATIC_DIR = os.environ.get("STATIC_DIR", "")
if STATIC_DIR and Path(STATIC_DIR).exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=f"{STATIC_DIR}/assets"), name="assets")

    # SPA fallback: all non-API routes return index.html
    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        file_path = Path(STATIC_DIR) / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(f"{STATIC_DIR}/index.html")
