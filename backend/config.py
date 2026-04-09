from pathlib import Path
import os

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "data"))
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local")
AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "false").lower() == "true"
ALLOWED_EMAIL = os.environ.get("ALLOWED_EMAIL", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:5173,http://localhost:80,http://localhost"
).split(",")
