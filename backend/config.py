from pathlib import Path
import os

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "data"))
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
