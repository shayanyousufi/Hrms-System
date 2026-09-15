"""0004 — Normalize roles into a dedicated table with M2M junction.

Replaces the users.role ENUM column with:
  - roles table (id, name, description, timestamps)
  - user_roles junction table (user_id FK, role_id FK, assigned_at)

Revision ID: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create roles table
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. Seed the four default roles
    roles_table = sa.table(
        "roles",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
    )
    op.bulk_insert(
        roles_table,
        [
            {"name": "SUPER_ADMIN", "description": "Full system access with hard-delete capability"},
            {"name": "HR", "description": "Employee management, exports, leave approval"},
            {"name": "MANAGER", "description": "Team-scoped access, leave approve/reject"},
            {"name": "EMPLOYEE", "description": "Self-only: profile, attendance, leave requests"},
        ],
    )

    # 3. Create user_roles junction table
    op.create_table(
        "user_roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_index("ix_user_roles_role_id", "user_roles", ["role_id"])

    # 4. Migrate existing data: users.role ENUM → user_roles junction rows
    op.execute("""
        INSERT INTO user_roles (user_id, role_id, assigned_at)
        SELECT u.id, r.id, NOW()
        FROM users u
        JOIN roles r ON r.name = u.role::text
    """)

    # 5. Drop the old role column and ENUM type
    op.drop_column("users", "role")
    op.execute("DROP TYPE IF EXISTS user_role")


def downgrade() -> None:
    # Recreate the ENUM type and role column
    op.execute("CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE')")
    op.add_column(
        "users",
        sa.Column("role", sa.Enum("SUPER_ADMIN", "HR", "MANAGER", "EMPLOYEE", name="user_role", create_type=False), server_default="EMPLOYEE", nullable=False),
    )

    # Migrate data back from junction to column
    op.execute("""
        UPDATE users u
        SET role = r.name::user_role
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
    """)

    # Drop junction tables
    op.drop_index("ix_user_roles_role_id", table_name="user_roles")
    op.drop_index("ix_user_roles_user_id", table_name="user_roles")
    op.drop_table("user_roles")
    op.drop_table("roles")
