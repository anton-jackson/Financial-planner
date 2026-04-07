import json
from pathlib import Path
from typing import Any

import yaml


class LocalFileStorage:
    """Storage backend that reads/writes YAML and JSON files on the local filesystem."""

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def _resolve(self, path: str) -> Path:
        return self.base_dir / path

    def read(self, path: str) -> dict[str, Any]:
        full = self._resolve(path)
        if not full.exists():
            raise FileNotFoundError(f"File not found: {full}")
        text = full.read_text()
        if full.suffix in (".yaml", ".yml"):
            return yaml.safe_load(text) or {}
        return json.loads(text)

    def write(self, path: str, data: dict[str, Any]) -> None:
        full = self._resolve(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        if full.suffix in (".yaml", ".yml"):
            full.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))
        else:
            full.write_text(json.dumps(data, indent=2, default=str))

    def list(self, prefix: str) -> list[str]:
        base = self._resolve(prefix)
        if not base.exists():
            return []
        return sorted(
            str(p.relative_to(self.base_dir))
            for p in base.iterdir()
            if p.is_file() and p.suffix in (".yaml", ".yml", ".json")
        )

    def exists(self, path: str) -> bool:
        return self._resolve(path).exists()

    def delete(self, path: str) -> None:
        full = self._resolve(path)
        if full.exists():
            full.unlink()
