"""Generate a single-page PDF payslip using fpdf2."""

from __future__ import annotations

import io
from decimal import Decimal
from datetime import datetime, timezone

from fpdf import FPDF

from app.models.payroll import Payslip, PayslipAllowance, PayslipDeduction
from app.models.employee import Employee
from app.models.payroll import PayrollRun


# ─── colour palette ─────────────────────────────────────────────
_PRIMARY = (79, 70, 229)      # indigo-600
_HEADER_BG = (79, 70, 229)
_WHITE = (255, 255, 255)
_LIGHT_BG = (245, 245, 250)
_BORDER = (220, 220, 230)
_GREEN = (22, 163, 74)        # green-600
_RED = (220, 38, 38)          # red-600
_GRAY = (107, 114, 128)       # gray-500
_DARK = (17, 24, 39)          # gray-900


def generate_payslip_pdf(
    payslip: Payslip,
    employee: Employee,
    run: PayrollRun,
    allowances: list[PayslipAllowance],
    deductions: list[PayslipDeduction],
) -> bytes:
    """Return the raw bytes of a generated PDF payslip."""
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    # ── header band ──────────────────────────────────────────────
    pdf.set_fill_color(*_HEADER_BG)
    pdf.rect(0, 0, 210, 40, "F")
    pdf.set_text_color(*_WHITE)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_xy(15, 10)
    pdf.cell(0, 10, "Tech Land", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(15)
    pdf.cell(0, 6, "Payslip", new_x="LMARGIN", new_y="NEXT")

    # ── period badge (right side of header) ──────────────────────
    period_label = _format_period(run.period)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(140, 14)
    pdf.cell(55, 8, period_label, align="R")

    # ── employee info block ──────────────────────────────────────
    y = 48
    pdf.set_text_color(*_DARK)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(15, y)
    pdf.cell(30, 6, "Employee")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(50, y)
    name = f"{employee.first_name} {employee.last_name}"
    pdf.cell(80, 6, name)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(140, y)
    pdf.cell(25, 6, "ID")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(165, y)
    pdf.cell(30, 6, employee.employee_id or "—")

    y += 8
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(15, y)
    pdf.cell(30, 6, "Department")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(50, y)
    pdf.cell(80, 6, employee.department or "—")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(140, y)
    pdf.cell(25, 6, "Status")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(165, y)
    pdf.cell(30, 6, run.status.capitalize())

    y += 8
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(15, y)
    pdf.cell(30, 6, "Designation")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(50, y)
    pdf.cell(80, 6, employee.designation or "—")

    # ── separator ────────────────────────────────────────────────
    y += 12
    pdf.set_draw_color(*_BORDER)
    pdf.line(15, y, 195, y)
    y += 5

    # ── earnings table ───────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*_PRIMARY)
    pdf.set_xy(15, y)
    pdf.cell(0, 7, "Earnings", new_x="LMARGIN", new_y="NEXT")
    y += 8

    # header row
    pdf.set_fill_color(*_LIGHT_BG)
    pdf.set_text_color(*_GRAY)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(15, y)
    pdf.cell(100, 7, "  Description", fill=True)
    pdf.cell(75, 7, "Amount", align="R", fill=True, new_x="LMARGIN", new_y="NEXT")
    y += 7

    # base salary row
    pdf.set_text_color(*_DARK)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(15, y)
    pdf.cell(100, 7, "  Basic Salary")
    pdf.cell(75, 7, _fmt_money(payslip.base_salary), align="R", new_x="LMARGIN", new_y="NEXT")
    y += 7

    # allowance rows
    total_allow = Decimal("0")
    for a in allowances:
        amt = Decimal(str(a.amount))
        total_allow += amt
        pdf.set_xy(15, y)
        pdf.cell(100, 7, f"    {a.category.capitalize()}")
        pdf.cell(75, 7, _fmt_money(amt), align="R", new_x="LMARGIN", new_y="NEXT")
        y += 7

    # total earnings
    pdf.set_draw_color(*_BORDER)
    pdf.line(15, y, 190, y)
    y += 1
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*_GREEN)
    pdf.set_xy(15, y)
    pdf.cell(100, 7, "  Total Allowances")
    pdf.cell(75, 7, f"+ {_fmt_money(total_allow)}", align="R", new_x="LMARGIN", new_y="NEXT")
    y += 10

    # ── deductions table ─────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*_RED)
    pdf.set_xy(15, y)
    pdf.cell(0, 7, "Deductions", new_x="LMARGIN", new_y="NEXT")
    y += 8

    pdf.set_fill_color(*_LIGHT_BG)
    pdf.set_text_color(*_GRAY)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(15, y)
    pdf.cell(100, 7, "  Description", fill=True)
    pdf.cell(75, 7, "Amount", align="R", fill=True, new_x="LMARGIN", new_y="NEXT")
    y += 7

    total_deduct = Decimal("0")
    if deductions:
        pdf.set_text_color(*_DARK)
        pdf.set_font("Helvetica", "", 10)
        for d in deductions:
            amt = Decimal(str(d.amount))
            total_deduct += amt
            pdf.set_xy(15, y)
            pdf.cell(100, 7, f"    {d.category.capitalize()}")
            pdf.cell(75, 7, _fmt_money(amt), align="R", new_x="LMARGIN", new_y="NEXT")
            y += 7
    else:
        pdf.set_text_color(*_GRAY)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_xy(15, y)
        pdf.cell(100, 7, "  No deductions", new_x="LMARGIN", new_y="NEXT")
        y += 7

    pdf.set_draw_color(*_BORDER)
    pdf.line(15, y, 190, y)
    y += 1
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*_RED)
    pdf.set_xy(15, y)
    pdf.cell(100, 7, "  Total Deductions")
    pdf.cell(75, 7, f"- {_fmt_money(total_deduct)}", align="R", new_x="LMARGIN", new_y="NEXT")
    y += 12

    # ── net pay box ──────────────────────────────────────────────
    pdf.set_fill_color(*_PRIMARY)
    pdf.set_draw_color(*_PRIMARY)
    pdf.rect(15, y, 180, 16, "F")
    pdf.set_text_color(*_WHITE)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_xy(20, y + 3)
    pdf.cell(80, 10, "Net Pay")
    pdf.set_xy(100, y + 3)
    pdf.cell(90, 10, _fmt_money(payslip.net_pay), align="R")
    y += 24

    # ── footer ───────────────────────────────────────────────────
    pdf.set_text_color(*_GRAY)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_xy(15, y)
    generated = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")
    pdf.cell(0, 5, f"Generated on {generated}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(15, y + 5)
    pdf.cell(0, 5, "This is a system-generated document. No signature required.", new_x="LMARGIN", new_y="NEXT")

    # ── output ───────────────────────────────────────────────────
    buf = io.BytesIO()
    pdf.output(buf)
    return buf.getvalue()


# ─── helpers ─────────────────────────────────────────────────────

def _fmt_money(val: Decimal | float | str) -> str:
    d = Decimal(str(val))
    return f"${d:,.2f}"


def _format_period(period: str) -> str:
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    parts = period.split("-")
    if len(parts) == 2:
        return f"{months[int(parts[1]) - 1]} {parts[0]}"
    return period
