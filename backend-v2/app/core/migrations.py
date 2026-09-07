"""Idempotent patch migrations.

The project currently relies on `Base.metadata.create_all` at startup, which only
creates missing tables and never alters existing ones. Until Alembic is introduced
(a later phase), small schema changes are applied here in an idempotent way.

Each entry checks whether a sentinel column exists before running its statements.
"""

from sqlalchemy import text

from app.core.database import engine

# Sentinel column -> list of statements to run if the sentinel is missing.
PATCH_MIGRATIONS = [
    {
        # password_resets gained expiry + single-use semantics.
        # Old schema: id, email, code VARCHAR(6), created_at
        # New schema: id, email, token_hash VARCHAR(128), created_at, expires_at, used
        "sentinel_check": (
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='password_resets' AND column_name='expires_at'"
        ),
        "statements": [
            "ALTER TABLE password_resets RENAME COLUMN code TO token_hash",
            "ALTER TABLE password_resets ALTER COLUMN token_hash TYPE VARCHAR(128) USING token_hash::VARCHAR(128)",
            "ALTER TABLE password_resets ADD COLUMN expires_at TIMESTAMPTZ",
            "ALTER TABLE password_resets ADD COLUMN used BOOLEAN NOT NULL DEFAULT FALSE",
        ],
    },
]


async def apply_patch_migrations() -> None:
    async with engine.begin() as conn:
        for migration in PATCH_MIGRATIONS:
            check = await conn.execute(text(migration["sentinel_check"]))
            if check.scalar():
                continue
            for statement in migration["statements"]:
                await conn.execute(text(statement))