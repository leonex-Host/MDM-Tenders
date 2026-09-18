"""
Structured Logger — file + console handlers
"""
import logging
import os
import collections
from app.config import settings

SYSTEM_LOGS = collections.deque(maxlen=1000)

class MemoryHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            SYSTEM_LOGS.append(msg)
        except:
            pass

_memory_handler = MemoryHandler()
_memory_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))

def setup_global_memory_logger():
    root = logging.getLogger()
    if _memory_handler not in root.handlers:
        root.addHandler(_memory_handler)
    
    # Also capture Uvicorn's access log (200 OK lines) and error log
    for uvicorn_logger_name in ("uvicorn.access", "uvicorn.error", "uvicorn"):
        uv_log = logging.getLogger(uvicorn_logger_name)
        if _memory_handler not in uv_log.handlers:
            uv_log.addHandler(_memory_handler)




def get_logger(name: str) -> logging.Logger:
    os.makedirs(settings.LOGS_DIR, exist_ok=True)
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # File
    fh = logging.FileHandler(os.path.join(settings.LOGS_DIR, f"{name}.log"), encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger
