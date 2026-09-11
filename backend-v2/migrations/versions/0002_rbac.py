"""rbac: users.role, employees.user_id, employees.manager_id

Adds Role-Based Access Control plumbing:
- users.role (enum user_role, default EMPLOYEE)
- employees.user_id FK -> users.id (one-to-one, backfilled by email match)
- employees.manager_id FK -> employees.id (self-referential, backfilled by
  reporting_manager free-text name match)

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# The values must match app/core/config.py UserRole (order matters for the DB enum).
user_role_values = ["SUPER_ADMIN", "HR", "MANAGER", "EMPLOYEE"]


def _table_exists(inspector, table: str) -> bool:
    try:
        return table in inspector.get_table_names()
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("users")}
    emp_columns = {c["name"] for c in inspector.get_columns("employees")}
    emp_fks = {fk["target_fullname"] for fk in inspector.get_foreign_keys("employees")}

    # --- users.role ---
    if "role" not in columns:
        user_role = sa.Enum(
            *user_role_values,
            name="user_role",
        )
        user_role.create(bind, checkfirst=True)
        op.add_column(
            "users",
            sa.Column(
                "role",
                sa.Enum(*user_role_values, name="user_role"),
                nullable=False,
                server_default="EMPLOYEE",
            ),
        )

    # --- employees.user_id (FK + unique) ---
    if "user_id" not in emp_columns:
        op.add_column(
            "employees",
            sa.Column("user_id", sa.Integer(), nullable=True),
        )

    # Backfill user_id from users by email (case-insensitive).
    result = bind.execute(
        sa.text(
            "UPDATE employees e SET user_id = u.id "
            "FROM users u WHERE LOWER(u.email) = LOWER(e.email) AND e.user_id IS NULL"
        )
    )

    if "employees_user_id_fkey" not in emp_fks:
        op.create_foreign_key(
            "employees_user_id_fkey", "employees", "users", ["user_id"], ["id"]
        )

    # Unique constraint on user_id (one user <-> one employee). Best-effort:
    # re-running on an already-migrated DB may find it exists under a diff name.
    try:
        uq_names = {uq.get("name") for uq in inspector.get_unique_constraints("employees")}
        if "employees_user_id_key" not in uq_names:
            op.create_unique_constraint("employees_user_id_key", "employees", ["user_id"])
    except Exception:
        pass

    # --- employees.manager_id (self-referential FK) ---
    if "manager_id" not in emp_columns:
        op.add_column(
            "employees",
            sa.Column("manager_id", sa.Integer(), nullable=True),
        )

    # Backfill manager_id from reporting_manager free-text name.
    bind.execute(
        sa.text(
            "UPDATE employees e SET manager_id = m.id "
            "FROM employees m "
            "WHERE e.manager_id IS NULL "
            "AND e.reporting_manager IS NOT NULL "
            "AND ("
            "   LOWER(BTRIM(e.reporting_manager)) = "
            "       LOWER(CONCAT(BTRIM(m.first_name), ' ', BTRIM(m.last_name))) "
            "   OR LOWER(BTRIM(e.reporting_manager)) = LOWER(BTRIM(m.first_name)) "
            ")"
        )
    )

    if "employees_manager_id_fkey" not in emp_fks:
        op.create_foreign_key(
            "employees_manager_id_fkey",
            "employees",
            "employees",
            ["manager_id"],
            ["id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    emp_fks = {fk["name"] for fk in inspector.get_foreign_keys("employees")}

    if "employees_manager_id_fkey" in emp_fks:
        op.drop_constraint("employees_manager_id_fkey", "employees", type_="foreignkey")
    if "employees_user_id_fkey" in emp_fks:
        op.drop_constraint("employees_user_id_fkey", "employees", type_="foreignkey")

    try:
        uq = ({uq["name"] for uq in inspector.get_unique_constraints("employees") if uq.get("name")})
        if "employees_user_id_key" in uq:
            op.drop_constraint("employees_user_id_key", "employees", type_="unique")
    except Exception:
        pass

    emp_columns = {c["name"] for c in inspector.get_columns("employees")}
    if "manager_id" in emp_columns:
        op.drop_column("employees", "manager_id")
    if "user_id" in emp_columns:
        op.drop_column("employees", "user_id")

    user_columns = {c["name"] for c in inspector.get_columns("users")}
    if "role" in user_columns:
        op.drop_column("users", "role")

    # Drop the enum type if it exists and nothing references it.
    try:
        sa.Enum(*user_role_values, name="user_role").drop(bind, checkfirst=True)
    except Exception:
        pass
