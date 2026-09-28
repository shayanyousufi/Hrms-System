"""Payroll Phase 1 integration tests.

Runs against the live FastAPI backend on http://127.0.0.1:8001.
Requires PostgreSQL `techland` running and migrations applied.

Coverage:
  - CRUD for payroll runs (create, list, get, update status, delete)
  - Payslip operations (add single, add bulk, remove)
  - Allowance/deduction operations (add, remove, net_pay recalc)
  - RBAC: EMPLOYEE cannot access payroll endpoints
  - RBAC: HR can create runs but only SUPER_ADMIN can finalize/pay
  - State machine: can't edit finalized/paid, can't pay before finalize
"""
import os
import subprocess
import random
import string

import httpx
import pytest

BASE = "http://127.0.0.1:8001"
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"


def _rand(tag: str) -> str:
    return f"{tag}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"


_period_counter = 0

def _period() -> str:
    """Generate a unique YYYY-MM period — monotonic counter across 2030+."""
    global _period_counter
    _period_counter += 1
    month = ((_period_counter - 1) % 12) + 1
    year = 2030 + (_period_counter - 1) // 12
    return f"{year}-{month:02d}"


def _http() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=60.0)


def _sql(query: str) -> str:
    env = dict(os.environ, PGPASSWORD="SK_7")
    out = subprocess.run(
        [PSQL, "-U", "postgres", "-d", "techland", "-t", "-A", "-c", query],
        capture_output=True, text=True, env=env, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr}")
    return out.stdout.strip()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_runs():
    """Remove any leftover payroll test data before and after tests."""
    # Clean up runs from test years
    _sql("DELETE FROM payslip_deductions WHERE payslip_id IN (SELECT id FROM payslips WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period >= '2030-01'))")
    _sql("DELETE FROM payslip_allowances WHERE payslip_id IN (SELECT id FROM payslips WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period >= '2030-01'))")
    _sql("DELETE FROM payslips WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period >= '2030-01')")
    _sql("DELETE FROM payroll_runs WHERE period >= '2030-01'")
    yield
    _sql("DELETE FROM payslip_deductions WHERE payslip_id IN (SELECT id FROM payslips WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period >= '2030-01'))")
    _sql("DELETE FROM payslip_allowances WHERE payslip_id IN (SELECT id FROM payslips WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period >= '2030-01'))")
    _sql("DELETE FROM payslips WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE period >= '2030-01')")
    _sql("DELETE FROM payroll_runs WHERE period >= '2030-01'")


@pytest.fixture(scope="module")
def client():
    with _http() as c:
        yield c


@pytest.fixture(scope="module")
def admin_user(client):
    """Existing SUPER_ADMIN user — use shayan.yousufi07@gmail.com (SUPER_ADMIN + MANAGER)."""
    email = "shayan.yousufi07@gmail.com"
    r = client.post("/api/auth/login", json={"email": email, "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return {"email": email, "password": "Admin@123", "token": r.json()["access_token"], "user_id": r.json()["user"]["id"]}


@pytest.fixture(scope="module")
def hr_user(client):
    """Existing HR user — sara33@gmail.com (EMPLOYEE + SUPER_ADMIN + HR)."""
    email = "sara33@gmail.com"
    r = client.post("/api/auth/login", json={"email": email, "password": "Test@12345"})
    if r.status_code != 200:
        # If password is wrong, create a fresh HR user
        email = f"payroll_hr_{_rand('hr')}@example.com"
        r = client.post("/api/auth/register", json={"email": email, "password": "ReusablePass1"})
        user_id = r.json()["user"]["id"]
        _sql(f"DELETE FROM user_roles WHERE user_id = {user_id}")
        _sql(f"INSERT INTO user_roles (user_id, role_id) VALUES ({user_id}, (SELECT id FROM roles WHERE name='HR'))")
        r = client.post("/api/auth/login", json={"email": email, "password": "ReusablePass1"})
    assert r.status_code == 200, r.text
    return {"email": email, "token": r.json()["access_token"], "user_id": r.json()["user"]["id"]}


@pytest.fixture(scope="module")
def employee_user(client):
    """Fresh EMPLOYEE user."""
    email = f"payroll_emp_{_rand('emp')}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "ReusablePass1"})
    assert r.status_code in (200, 201), r.text
    return {"email": email, "password": "ReusablePass1", "token": r.json()["access_token"]}


@pytest.fixture(scope="module")
def test_employee_id():
    """Create a test employee for payslip tests."""
    code = f"EMP-PAY-{random.randint(1000, 9999)}"
    email = f"emp_{_rand('emp')}@example.com"
    _sql(
        "INSERT INTO employees (employee_id, first_name, last_name, email, department, designation,"
        f" joining_date, employment_status, salary) VALUES ('{code}','Pay','Test','{email}','Finance',"
        f"'Accountant','2026-01-01','Active',100000)"
    )
    emp_id = _sql("SELECT id FROM employees ORDER BY id DESC LIMIT 1")
    yield int(emp_id)
    _sql(f"DELETE FROM payslip_deductions WHERE payslip_id IN (SELECT id FROM payslips WHERE employee_id={emp_id})")
    _sql(f"DELETE FROM payslip_allowances WHERE payslip_id IN (SELECT id FROM payslips WHERE employee_id={emp_id})")
    _sql(f"DELETE FROM payslips WHERE employee_id={emp_id}")
    _sql(f"DELETE FROM employees WHERE id={emp_id}")


@pytest.fixture(scope="module")
def test_employee_id_2():
    """Second test employee for bulk tests."""
    code = f"EMP-PAY2-{random.randint(1000, 9999)}"
    email = f"emp2_{_rand('emp')}@example.com"
    _sql(
        "INSERT INTO employees (employee_id, first_name, last_name, email, department, designation,"
        f" joining_date, employment_status, salary) VALUES ('{code}','Pay2','Test','{email}','Finance',"
        f"'Clerk','2026-01-01','Active',80000)"
    )
    emp_id = _sql("SELECT id FROM employees ORDER BY id DESC LIMIT 1")
    yield int(emp_id)
    _sql(f"DELETE FROM payslip_deductions WHERE payslip_id IN (SELECT id FROM payslips WHERE employee_id={emp_id})")
    _sql(f"DELETE FROM payslip_allowances WHERE payslip_id IN (SELECT id FROM payslips WHERE employee_id={emp_id})")
    _sql(f"DELETE FROM payslips WHERE employee_id={emp_id}")
    _sql(f"DELETE FROM employees WHERE id={emp_id}")


def _cleanup_run(client, token, run_id):
    """Best-effort cleanup of a payroll run."""
    try:
        client.delete(f"/api/payroll/runs/{run_id}", headers=_auth(token))
    except Exception:
        pass


# ──────── RBAC Tests ────────


class TestPayrollRBAC:
    def test_employee_cannot_list_runs(self, client, employee_user):
        r = client.get("/api/payroll/runs", headers=_auth(employee_user["token"]))
        assert r.status_code == 403

    def test_employee_cannot_create_run(self, client, employee_user):
        r = client.post("/api/payroll/runs", json={"period": _period()}, headers=_auth(employee_user["token"]))
        assert r.status_code == 403

    def test_employee_cannot_add_payslip(self, client, employee_user):
        r = client.post("/api/payroll/runs/1/payslips", json={"employee_id": 1}, headers=_auth(employee_user["token"]))
        assert r.status_code == 403

    def test_hr_can_create_run(self, client, hr_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(hr_user["token"]))
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "draft"
        _cleanup_run(client, hr_user["token"], r.json()["id"])

    def test_hr_cannot_finalize_run(self, client, hr_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(hr_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        r = client.patch(f"/api/payroll/runs/{run_id}", json={"status": "finalized"}, headers=_auth(hr_user["token"]))
        assert r.status_code == 403
        _cleanup_run(client, hr_user["token"], run_id)


# ──────── CRUD Tests ────────


class TestPayrollRuns:
    def test_create_and_list_run(self, client, admin_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run = r.json()
        assert run["period"] == period
        assert run["status"] == "draft"

        r = client.get("/api/payroll/runs", headers=_auth(admin_user["token"]))
        assert r.status_code == 200
        assert any(x["id"] == run["id"] for x in r.json())
        _cleanup_run(client, admin_user["token"], run["id"])

    def test_duplicate_period_rejected(self, client, admin_user):
        period = _period()
        r1 = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r1.status_code == 201, r1.text
        r2 = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r2.status_code == 409
        _cleanup_run(client, admin_user["token"], r1.json()["id"])

    def test_invalid_period_format(self, client, admin_user):
        r = client.post("/api/payroll/runs", json={"period": "not-a-date"}, headers=_auth(admin_user["token"]))
        assert r.status_code == 422

    def test_delete_draft_run(self, client, admin_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        r = client.delete(f"/api/payroll/runs/{run_id}", headers=_auth(admin_user["token"]))
        assert r.status_code == 200

    def test_cannot_delete_finalized_run(self, client, admin_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        client.patch(f"/api/payroll/runs/{run_id}", json={"status": "finalized"}, headers=_auth(admin_user["token"]))
        r = client.delete(f"/api/payroll/runs/{run_id}", headers=_auth(admin_user["token"]))
        assert r.status_code == 400


# ──────── Payslip Tests ────────


class TestPayslips:
    def test_add_payslip_copies_salary(self, client, admin_user, test_employee_id):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]

        r = client.post(f"/api/payroll/runs/{run_id}/payslips", json={"employee_id": test_employee_id}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        payslip = r.json()
        assert float(payslip["base_salary"]) == 100000.0
        assert float(payslip["net_pay"]) == 100000.0
        assert payslip["employee_id"] == test_employee_id
        _cleanup_run(client, admin_user["token"], run_id)

    def test_duplicate_payslip_rejected(self, client, admin_user, test_employee_id):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        client.post(f"/api/payroll/runs/{run_id}/payslips", json={"employee_id": test_employee_id}, headers=_auth(admin_user["token"]))
        r2 = client.post(f"/api/payroll/runs/{run_id}/payslips", json={"employee_id": test_employee_id}, headers=_auth(admin_user["token"]))
        assert r2.status_code == 409
        _cleanup_run(client, admin_user["token"], run_id)

    def test_bulk_add_payslips(self, client, admin_user, test_employee_id, test_employee_id_2):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]

        r = client.post(
            f"/api/payroll/runs/{run_id}/payslips/bulk",
            json={"employee_ids": [test_employee_id, test_employee_id_2]},
            headers=_auth(admin_user["token"]),
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["created"] == 2
        assert data["skipped"] == 0
        _cleanup_run(client, admin_user["token"], run_id)

    def test_remove_payslip(self, client, admin_user, test_employee_id):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        r = client.post(f"/api/payroll/runs/{run_id}/payslips", json={"employee_id": test_employee_id}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        payslip_id = r.json()["id"]
        r = client.delete(f"/api/payroll/runs/{run_id}/payslips/{payslip_id}", headers=_auth(admin_user["token"]))
        assert r.status_code == 200
        _cleanup_run(client, admin_user["token"], run_id)

    def test_cannot_add_payslip_to_finalized_run(self, client, admin_user, test_employee_id):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        client.patch(f"/api/payroll/runs/{run_id}", json={"status": "finalized"}, headers=_auth(admin_user["token"]))
        r = client.post(f"/api/payroll/runs/{run_id}/payslips", json={"employee_id": test_employee_id}, headers=_auth(admin_user["token"]))
        assert r.status_code == 400


# ──────── Allowance / Deduction Tests ────────


class TestLineItems:
    def _make_run_with_payslip(self, client, admin_user, test_employee_id):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        r = client.post(f"/api/payroll/runs/{run_id}/payslips", json={"employee_id": test_employee_id}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        payslip_id = r.json()["id"]
        return run_id, payslip_id

    def test_add_allowance_recalculates_net(self, client, admin_user, test_employee_id):
        run_id, payslip_id = self._make_run_with_payslip(client, admin_user, test_employee_id)
        r = client.post(f"/api/payroll/payslips/{payslip_id}/allowances", json={"category": "transport", "amount": 10000}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        assert r.json()["category"] == "transport"

        r = client.get(f"/api/payroll/runs/{run_id}", headers=_auth(admin_user["token"]))
        ps = [p for p in r.json().get("payslips", []) if p["id"] == payslip_id][0]
        assert float(ps["net_pay"]) == 110000.0, f"Expected 110000.0, got {ps['net_pay']}"
        _cleanup_run(client, admin_user["token"], run_id)

    def test_add_deduction_recalculates_net(self, client, admin_user, test_employee_id):
        run_id, payslip_id = self._make_run_with_payslip(client, admin_user, test_employee_id)
        client.post(f"/api/payroll/payslips/{payslip_id}/deductions", json={"category": "eobi", "amount": 1250}, headers=_auth(admin_user["token"]))
        client.post(f"/api/payroll/payslips/{payslip_id}/allowances", json={"category": "medical", "amount": 5000}, headers=_auth(admin_user["token"]))

        r = client.get(f"/api/payroll/runs/{run_id}", headers=_auth(admin_user["token"]))
        ps = [p for p in r.json().get("payslips", []) if p["id"] == payslip_id][0]
        assert float(ps["net_pay"]) == 103750.0, f"Expected 103750.0, got {ps['net_pay']}"
        _cleanup_run(client, admin_user["token"], run_id)

    def test_duplicate_category_rejected(self, client, admin_user, test_employee_id):
        run_id, payslip_id = self._make_run_with_payslip(client, admin_user, test_employee_id)
        client.post(f"/api/payroll/payslips/{payslip_id}/allowances", json={"category": "transport", "amount": 5000}, headers=_auth(admin_user["token"]))
        r2 = client.post(f"/api/payroll/payslips/{payslip_id}/allowances", json={"category": "transport", "amount": 3000}, headers=_auth(admin_user["token"]))
        assert r2.status_code == 409
        _cleanup_run(client, admin_user["token"], run_id)

    def test_remove_allowance_recalculates_net(self, client, admin_user, test_employee_id):
        run_id, payslip_id = self._make_run_with_payslip(client, admin_user, test_employee_id)
        r = client.post(f"/api/payroll/payslips/{payslip_id}/allowances", json={"category": "housing", "amount": 20000}, headers=_auth(admin_user["token"]))
        allow_id = r.json()["id"]
        client.delete(f"/api/payroll/payslips/{payslip_id}/allowances/{allow_id}", headers=_auth(admin_user["token"]))
        r = client.get(f"/api/payroll/runs/{run_id}", headers=_auth(admin_user["token"]))
        ps = [p for p in r.json().get("payslips", []) if p["id"] == payslip_id][0]
        assert float(ps["net_pay"]) == 100000.0, f"Expected 100000.0, got {ps['net_pay']}"
        _cleanup_run(client, admin_user["token"], run_id)

    def test_invalid_category_rejected(self, client, admin_user, test_employee_id):
        run_id, payslip_id = self._make_run_with_payslip(client, admin_user, test_employee_id)
        r = client.post(f"/api/payroll/payslips/{payslip_id}/allowances", json={"category": "invalid_cat", "amount": 1000}, headers=_auth(admin_user["token"]))
        assert r.status_code == 422
        _cleanup_run(client, admin_user["token"], run_id)

    def test_negative_amount_rejected(self, client, admin_user, test_employee_id):
        run_id, payslip_id = self._make_run_with_payslip(client, admin_user, test_employee_id)
        r = client.post(f"/api/payroll/payslips/{payslip_id}/deductions", json={"category": "loan", "amount": -500}, headers=_auth(admin_user["token"]))
        assert r.status_code == 422
        _cleanup_run(client, admin_user["token"], run_id)


# ──────── Status Machine Tests ────────


class TestStatusMachine:
    def test_drafted_then_finalized_then_paid(self, client, admin_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        assert r.json()["status"] == "draft"

        r = client.patch(f"/api/payroll/runs/{run_id}", json={"status": "finalized"}, headers=_auth(admin_user["token"]))
        assert r.json()["status"] == "finalized"

        r = client.patch(f"/api/payroll/runs/{run_id}", json={"status": "paid"}, headers=_auth(admin_user["token"]))
        assert r.json()["status"] == "paid"

    def test_cannot_skip_to_paid(self, client, admin_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        r = client.patch(f"/api/payroll/runs/{run_id}", json={"status": "paid"}, headers=_auth(admin_user["token"]))
        assert r.status_code == 400

    def test_cannot_change_paid_status(self, client, admin_user):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(admin_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        client.patch(f"/api/payroll/runs/{run_id}", json={"status": "finalized"}, headers=_auth(admin_user["token"]))
        client.patch(f"/api/payroll/runs/{run_id}", json={"status": "paid"}, headers=_auth(admin_user["token"]))
        r = client.patch(f"/api/payroll/runs/{run_id}", json={"status": "draft"}, headers=_auth(admin_user["token"]))
        assert r.status_code == 400


class TestPayslipPdf:
    """Tests for the PDF payslip download endpoint."""

    def _make_payslip_with_pdf(self, client, hr_user, admin_user, test_employee_id):
        period = _period()
        r = client.post("/api/payroll/runs", json={"period": period}, headers=_auth(hr_user["token"]))
        assert r.status_code == 201, r.text
        run_id = r.json()["id"]
        r = client.post(f"/api/payroll/runs/{run_id}/payslips", json={"employee_id": test_employee_id}, headers=_auth(hr_user["token"]))
        assert r.status_code == 201, r.text
        payslip_id = r.json()["id"]
        return run_id, payslip_id

    def test_hr_can_download_pdf(self, client, hr_user, admin_user, test_employee_id):
        run_id, payslip_id = self._make_payslip_with_pdf(client, hr_user, admin_user, test_employee_id)
        r = client.get(f"/api/payroll/payslips/{payslip_id}/pdf", headers=_auth(hr_user["token"]))
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:5] == b"%PDF-"

    def test_admin_can_download_pdf(self, client, admin_user, test_employee_id):
        run_id, payslip_id = self._make_payslip_with_pdf(client, admin_user, admin_user, test_employee_id)
        r = client.get(f"/api/payroll/payslips/{payslip_id}/pdf", headers=_auth(admin_user["token"]))
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"

    def test_employee_cannot_download_pdf(self, client, hr_user, admin_user, employee_user, test_employee_id):
        run_id, payslip_id = self._make_payslip_with_pdf(client, hr_user, admin_user, test_employee_id)
        r = client.get(f"/api/payroll/payslips/{payslip_id}/pdf", headers=_auth(employee_user["token"]))
        assert r.status_code == 403

    def test_pdf_contains_content_disposition(self, client, hr_user, test_employee_id):
        run_id, payslip_id = self._make_payslip_with_pdf(client, hr_user, hr_user, test_employee_id)
        r = client.get(f"/api/payroll/payslips/{payslip_id}/pdf", headers=_auth(hr_user["token"]))
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "payslip" in cd.lower()
        assert ".pdf" in cd

    def test_nonexistent_payslip_returns_404(self, client, hr_user):
        r = client.get("/api/payroll/payslips/999999/pdf", headers=_auth(hr_user["token"]))
        assert r.status_code == 404
