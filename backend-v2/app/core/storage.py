"""Validation + storage helpers for employee documents (Backblaze B2).

Files are validated here (extension allow-list, 5 MB limit), then persisted
to B2 under server-generated UUID keys. Original filenames stay in the
database only and are never used as storage keys. Path traversal is
impossible because stored names are generated server-side.

B2 key layout:
    employee-documents/<employee_id>/<uuid>.<ext>
"""
import re
import uuid
from pathlib import Path

from fastapi import HTTPException

from app.core.b2 import delete_object as delete_key, get_object_bytes as download_bytes, put_object as upload_bytes


# Common office documents + images. Executables and everything else are rejected.
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
}
# 5 MB upload limit.
MAX_FILE_SIZE = 5 * 1024 * 1024

# Characters that can never appear in a stored filename.
_BAD_NAME = re.compile(r"[\\/\x00-\x1f]")


def _extension_for(filename: str) -> str:
    """Return a lower-cased, allow-listed extension for a client filename."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    return suffix


def validate_upload(filename: str, content_type: str, size: int) -> str:
    """Validate a document upload; returns the safe extension.

    Rejects executable/unknown types, unexpected MIME types, oversized files,
    and unsafe filenames.
    """
    if size <= 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (maximum 5 MB)")
    if _BAD_NAME.search(filename or ""):
        raise HTTPException(status_code=400, detail="Invalid filename")
    ext = _extension_for(filename)
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        # Allow mismatched-but-allow-listed extension + empty content type; reject
        # explicit disallowed types.
        raise HTTPException(status_code=400, detail="Unsupported file type")
    return ext


def save_document(employee_id: int, original_filename: str, data: bytes, content_type: str = "") -> str:
    """Persist a document to B2 and return its storage key (relative path).

    The stored name contains only a UUID + allow-listed extension, so it is
    safe to persist as the object key.
    """
    ext = validate_upload(original_filename, content_type or "", len(data))
    stored_name = f"{uuid.uuid4().hex}{ext}"
    key = f"employee-documents/{int(employee_id)}/{stored_name}"
    upload_bytes(key, data, content_type or "application/octet-stream")
    return key


def fetch_document(stored_filename: str) -> bytes:
    """Download document bytes from B2 by storage key."""
    if not stored_filename:
        raise HTTPException(status_code=404, detail="No file attached to this document")
    return download_bytes(stored_filename)


def delete_document(stored_filename: str) -> None:
    if not stored_filename:
        return
    delete_key(stored_filename)