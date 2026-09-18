"""
Sync Manager - Handles thread-safe stop scraping flags.
"""
from typing import Dict
from threading import Lock

class SyncManager:
    def __init__(self):
        self._stop_flags: Dict[str, bool] = {}
        self._lock = Lock()

    def set_stop_flag(self, source: str) -> None:
        """Set the stop flag for a specific source, or 'all' for all sources."""
        with self._lock:
            if source == "all":
                # Set true for any existing flag, plus an 'all' fallback
                for k in self._stop_flags.keys():
                    self._stop_flags[k] = True
                self._stop_flags["all"] = True
            else:
                self._stop_flags[source] = True

    def clear_stop_flag(self, source: str) -> None:
        """Clear the stop flag for a source before it starts running."""
        with self._lock:
            self._stop_flags[source] = False
            self._stop_flags["all"] = False

    def should_stop(self, source: str) -> bool:
        """Check if the given source (or 'all') has been flagged to stop."""
        with self._lock:
            if self._stop_flags.get("all", False):
                return True
            return self._stop_flags.get(source, False)

# Global singleton
sync_manager = SyncManager()

class ScrapeStoppedException(Exception):
    """Exception raised when a user requests to stop the running sync."""
    pass
