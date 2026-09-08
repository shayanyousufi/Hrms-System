"""Phase 3: document metadata + storage columns

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-08

Adds file-storage metadata to `employee_documents` (stored_filename, content_type,
file_size) and the uploading user (uploaded_by -> users.id). Existing rows keep
stored_filename NULL and are treated as metadata-only placeholders.
"""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employee_documents", sa.Column("stored_filename", sa.String(length=255), nullable=True))
    op.add_column("employee_documents", sa.Column("content_type", sa.String(length=100), nullable=True))
    op.add_column("employee_documents", sa.Column("file_size", sa.Integer(), nullable=True))
    op.add_column("employee_documents", sa.Column("uploaded_by", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_employee_documents_employee_id"),
        "employee_documents",
        ["employee_id"],
        unique=False,
    )
    op.create_foreign_key(
        "employee_documents_uploaded_by_fkey",
        "employee_documents",
        "users",
        ["uploaded_by"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("employee_documents_uploaded_by_fkey", "employee_documents", type_="foreignkey")
    op.drop_index(op.f("ix_employee_documents_employee_id"), table_name="employee_documents")
    op.drop_column("employee_documents", "uploaded_by")
    op.drop_column("employee_documents", "file_size")
    op.drop_column("employee_documents", "content_type")
    op.drop_column("employee_documents", "stored_filename")