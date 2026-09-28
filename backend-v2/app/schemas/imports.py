"""Schemas for bulk employee import (CSV / XLSX)."""
from typing import List, Dict, Optional
from pydantic import BaseModel


class ImportRowResult(BaseModel):
    row: int
    data: Optional[Dict] = None
    valid: bool
    errors: List[str] = []


class ImportPreviewResponse(BaseModel):
    filename: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    duplicates_in_file: List[Dict]
    preview: List[ImportRowResult]


class ImportFailure(BaseModel):
    row: int
    error: str


class ImportConfirmResponse(BaseModel):
    filename: str
    total_rows: int
    successful: int
    failed: int
    failures: List[ImportFailure]