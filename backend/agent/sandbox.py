"""Scoped storage for agent output.

The agent can read from the full data directory but can only write
to the agent_sandbox/ subdirectory. This prevents the agent from
modifying the user's profile, assets, or scenarios while giving it
a place to persist analysis output (rebalance plans, allocation
recommendations, etc.) that downstream scripts and UI can consume.
"""

from pathlib import Path
from typing import Any

from storage.local import LocalFileStorage


class AgentSandbox:
    """Read-anywhere, write-only-to-sandbox storage wrapper."""

    SANDBOX_PREFIX = "agent_sandbox"

    def __init__(self, storage: LocalFileStorage):
        self._storage = storage
        # Ensure the sandbox directory exists
        sandbox_dir = storage.base_dir / self.SANDBOX_PREFIX
        sandbox_dir.mkdir(parents=True, exist_ok=True)

    # --- Read: full access (delegates to underlying storage) ---

    def read(self, path: str) -> dict[str, Any]:
        return self._storage.read(path)

    def list(self, prefix: str) -> list[str]:
        return self._storage.list(prefix)

    def exists(self, path: str) -> bool:
        return self._storage.exists(path)

    # --- Write: sandbox only ---

    def write(self, filename: str, data: dict[str, Any]) -> None:
        """Write a file into the sandbox. Filename must not escape the sandbox."""
        safe = self._safe_path(filename)
        self._storage.write(f"{self.SANDBOX_PREFIX}/{safe}", data)

    def delete(self, filename: str) -> None:
        """Delete a file from the sandbox."""
        safe = self._safe_path(filename)
        self._storage.delete(f"{self.SANDBOX_PREFIX}/{safe}")

    def list_sandbox(self) -> list[str]:
        """List all files in the sandbox."""
        return self._storage.list(self.SANDBOX_PREFIX)

    def read_sandbox(self, filename: str) -> dict[str, Any]:
        """Read a file from the sandbox."""
        safe = self._safe_path(filename)
        return self._storage.read(f"{self.SANDBOX_PREFIX}/{safe}")

    def _safe_path(self, filename: str) -> str:
        """Prevent path traversal out of the sandbox."""
        resolved = (Path(self.SANDBOX_PREFIX) / filename).resolve()
        sandbox_root = (Path(self.SANDBOX_PREFIX)).resolve()
        if not str(resolved).startswith(str(sandbox_root)):
            raise ValueError(f"Path escapes sandbox: {filename}")
        # Return just the relative part after sandbox prefix
        return str(resolved.relative_to(sandbox_root))
