"""
CallProof persistent logging.

All `callproof.*` loggers write to logs/callproof.log (rotating) in addition to
the terminal. Use `event()` for structured, greppable operational lines.
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "callproof.log")
MAX_BYTES = 5 * 1024 * 1024  # 5 MB
BACKUP_COUNT = 5

_CONFIGURED = False


def setup_logging(level: int = logging.INFO) -> str:
    """
    Attach a rotating file handler to the callproof logger tree.
    Safe to call more than once. Returns the log file path.
    """
    global _CONFIGURED
    os.makedirs(LOG_DIR, exist_ok=True)

    parent = logging.getLogger("callproof")
    parent.setLevel(level)

    if _CONFIGURED:
        return os.path.abspath(LOG_FILE)

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    fh = RotatingFileHandler(
        LOG_FILE,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    fh.setLevel(level)
    fh.setFormatter(fmt)
    parent.addHandler(fh)

    # Keep existing per-module basicConfig console handlers; file is additive.
    _CONFIGURED = True
    parent.info("event=logging_ready path=%s", os.path.abspath(LOG_FILE))
    return os.path.abspath(LOG_FILE)


def _fmt_value(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".")
    text = str(value).replace("\n", " ").replace("\r", " ").strip()
    if " " in text or "=" in text:
        text = text.replace('"', "'")
        return f'"{text}"'
    return text


def event(logger: logging.Logger, name: str, level: int = logging.INFO, **fields):
    """Write a structured event line: event=<name> key=value ..."""
    parts = [f"event={name}"]
    for key in sorted(fields):
        parts.append(f"{key}={_fmt_value(fields[key])}")
    logger.log(level, " ".join(parts))
