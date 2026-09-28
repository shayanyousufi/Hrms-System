"""One-time migration: upload local employee documents to Backblaze B2.

Walks backend-v2/uploads/employee-documents/<employee_id>/<uuid>.<ext>
and puts each file under the matching B2 key. Safe to re-run (overwrite).
Does not delete local files.
"""
import mimetypes
import sys
from pathlib import Path

# backend-v2/ on sys.path so app.* imports work
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.b2 import put_object  # noqa: E402
from app.core.config import settings  # noqa: E402

UPLOAD_ROOT = ROOT / "uploads" / "employee-documents"


def content_type_for(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def main() -> int:
    if not settings.b2_configured:
        print("B2 not configured (B2_KEY_ID/B2_APP_KEY/B2_BUCKET/B2_ENDPOINT missing)")
        return 1
    if not UPLOAD_ROOT.is_dir():
        print(f"No local upload dir: {UPLOAD_ROOT}")
        return 0

    files = sorted(p for p in UPLOAD_ROOT.rglob("*") if p.is_file())
    if not files:
        print("Nothing to migrate.")
        return 0

    ok = fail = 0
    for path in files:
        rel = path.relative_to(UPLOAD_ROOT).as_posix()
        key = f"employee-documents/{rel}"
        try:
            put_object(key, path.read_bytes(), content_type_for(path))
            print(f"OK  {key}")
            ok += 1
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {key}: {exc}")
            fail += 1

    print(f"\nMigrated {ok}/{len(files)} objects to bucket {settings.B2_BUCKET}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
