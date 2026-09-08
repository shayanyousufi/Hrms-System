"""Secure local-file storage for employee documents.

Files are written under a protected directory OUTSIDE any web root, keyed by a
server-generated UUID + verified extension. Original filenames stay in the
database only and are never used as filesystem paths. Path traversal (..\\ / ..)
and shell metacharacters are impossible in stored names because the stored name
is generated server-side.

Layout:
    <UPLOAD_DIR>/employee-documents/<employee_id>/<uuid>.<ext>
"""
import os
import re
import uuid
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings


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


def upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


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


def employee_document_dir(employee_id: int) -> Path:
    """Directory for a specific employee's documents (no client input inside)."""
    d = upload_root() / "employee-documents" / str(int(employee_id))
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_document(employee_id: int, original_filename: str, data: bytes) -> str:
    """Persist a document and return its RELATIVE stored path.

    The stored name contains only a UUID + allow-listed extension, so it is safe
    to persist and later rebuild into an absolute path.
    """
    ext = validate_upload(original_filename, "", len(data))
    base = employee_document_dir(employee_id)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    (base / stored_name).write_bytes(data)
    return f"employee-documents/{employee_id}/{stored_name}"


def resolve_stored_path(stored_filename: str) -> Path:
    """Resolve a stored relative path to an absolute path (traversal-safe)."""
    root = upload_root().resolve()
    candidate = (root / stored_filename).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document path")
    return candidate


def delete_document(stored_filename: str) -> None:
    if not stored_filename:
        return
    path = resolve_stored_path(stored_filename)
    try:
        path.unlink(missing_ok=True)
        os.removedirs(path.parent)
    except OSError:
        pass