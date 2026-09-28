"""0005 — Add Phase 1 Payroll tables.

Creates:
  - payroll_runs: monthly batch container
  - payslips: per-employee pay statement
  - payslip_allowances: itemized allowances per payslip
  - payslip_deductions: itemized deductions per payslip

Revision ID: 0005
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. payroll_runs
    op.create_table(
        "payroll_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("period", sa.String(7), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. payslips
    op.create_table(
        "payslips",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("payroll_run_id", sa.Integer(), sa.ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("base_salary", sa.Numeric(12, 2), nullable=False),
        sa.Column("net_pay", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("payroll_run_id", "employee_id", name="uq_payslip_per_run"),
    )

    # 3. payslip_allowances
    op.create_table(
        "payslip_allowances",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("payslip_id", sa.Integer(), sa.ForeignKey("payslips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint("payslip_id", "category", name="uq_allowance_per_payslip"),
    )

    # 4. payslip_deductions
    op.create_table(
        "payslip_deductions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("payslip_id", sa.Integer(), sa.ForeignKey("payslips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint("payslip_id", "category", name="uq_deduction_per_payslip"),
    )


def downgrade() -> None:
    op.drop_table("payslip_deductions")
    op.drop_table("payslip_allowances")
    op.drop_table("payslips")
    op.drop_table("payroll_runs")
