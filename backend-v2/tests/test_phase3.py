"""Phase 3 automated tests: Documents, Reports, Imports + CSV export hardening.

Runs against the live FastAPI backend on http://127.0.0.1:8001 (same pattern
as test_rbac.py). Requires PostgreSQL `techland` running and migrations applied.

Coverage:
  - Document upload/download/delete + validation (extension, size, empty).
  - Placeholder docs (no stored file) return 404 on download.
  - Document RBAC: employee cannot access others' docs.
  - Reports RBAC + scope (HR/org vs employee/self) + salary gating + PDF export.
  - Import template / preview / confirm + in-file & DB duplicate detection.
  - CSV export date/status/department filter hardening.

Run with:  pytest tests/test_phase3.py -v
"""
import os
import random
import string
import datetime as dt
import uuid
import io
import csv
import httpx
import pytest

BASE = "http://127.0.0.1:8001"
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"


def _rand(tag: str) -> str:
    return f"{tag}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"


def _http() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=30.0)


def _sql(query: str) -> str:
    import subprocess
    env = dict(os.environ, PGPASSWORD="SK_7")
    out = subprocess.run(
        [PSQL, "-U", "postgres", "-d", "techland", "-t", "-A", "-c", query],
        capture_output=True, text=True, env=env, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr}")
    return out.stdout.strip()


def _register(client: httpx.Client, email: str, password: str = "TestPass123!"):
    return client.post("/api/auth/register", json={"email": email, "password": password, "phone": "03000000000"})


def _login(client: httpx.Client, email: str, password: str = "TestPass123!"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _make_csv(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["email", "first_name", "last_name", "department",
                                        "designation", "joining_date", "employment_status", "salary"])
    w.writeheader()
    for row in rows:
        w.writerow(row)
    return buf.getvalue().encode("utf-8-sig")


@pytest.fixture(scope="module")
def client():
    with _http() as c:
        yield c


@pytest.fixture(scope="module")
def hr_token(client):
    email = f"{_rand('p3hr')}@example.com"
    r = _register(client, email)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["user"]["id"]
    _sql(f"UPDATE users SET role='HR' WHERE id={uid}")
    return _login(client, email).json()["access_token"]


@pytest.fixture(scope="module")
def emp_token(client):
    email = f"{_rand('p3emp')}@example.com"
    r = _register(client, email)
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def emp_code(client, emp_token):
    email = f"{_rand('p3own')}@example.com"
    r = _register(client, email)
    owner_uid = r.json()["user"]["id"]
    code = f"EMP-{uuid.uuid4().hex[:5].upper()}"
    _sql(
        "INSERT INTO employees (employee_id, user_id, first_name, last_name, email, department, designation,"
        f" joining_date, employment_status) VALUES ('{code}',{owner_uid},'Owner','Test','{email}','Engineering','Dev','2026-01-01','Active')"
    )
    return code


@pytest.fixture(scope="module")
def seed_doc(emp_code):
    eid = _sql(f"SELECT id FROM employees WHERE employee_id='{emp_code}'")
    _sql(f"INSERT INTO employee_documents (employee_id, name, doc_type) VALUES ({eid},'Placeholder','General')")
    return True


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class TestDocumentsRBAC:
    def test_upload_and_download(self, client, hr_token, emp_code):
        r = client.post(
            f"/api/employees/{emp_code}/documents?doc_type=Contract",
            headers={"Authorization": f"Bearer {hr_token}"},
            files={"file": ("test.pdf", b"%PDF-1.4 fake data", "application/pdf")},
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["has_file"] is True
        assert data["content_type"] == "application/pdf"
        assert "uploaded_by_name" in data
        doc_id = data["id"]

        r2 = client.get(f"/api/employees/{emp_code}/documents/{doc_id}/download",
                        headers={"Authorization": f"Bearer {hr_token}"})
        assert r2.status_code == 200, r2.text
        assert b"%PDF" in r2.content
        assert "attachment" in r2.headers.get("content-disposition", "")

    def test_rejects_empty_file(self, client, hr_token, emp_code):
        r = client.post(
            f"/api/employees/{emp_code}/documents?doc_type=General",
            headers={"Authorization": f"Bearer {hr_token}"},
            files={"file": ("empty.pdf", b"", "application/pdf")},
        )
        assert r.status_code in (400, 422), r.text

    def test_rejects_disallowed_extension(self, client, hr_token, emp_code):
        r = client.post(
            f"/api/employees/{emp_code}/documents?doc_type=General",
            headers={"Authorization": f"Bearer {hr_token}"},
            files={"file": ("evil.exe", b"evil", "application/octet-stream")},
        )
        assert r.status_code == 400, r.text

    def test_rejects_oversized(self, client, hr_token, emp_code):
        r = client.post(
            f"/api/employees/{emp_code}/documents?doc_type=General",
            headers={"Authorization": f"Bearer {hr_token}"},
            files={"file": ("huge.pdf", b"x" * (5 * 1024 * 1024 + 1), "application/pdf")},
        )
        assert r.status_code == 400, r.text

    def test_placeholder_doc_download_returns_404(self, client, hr_token, seed_doc):
        doc_id = _sql(
            f"SELECT id FROM employee_documents WHERE stored_filename IS NULL ORDER BY id LIMIT 1"
        )
        r = client.get(f"/api/employees/placeholder/documents/{doc_id}/download",
                       headers={"Authorization": f"Bearer {hr_token}"})
        # Route needs a real employee code; fall back to scanning wrapped in try.
        # Instead, resolve the owning employee code:
        owner = _sql(f"SELECT e.employee_id FROM employee_documents d JOIN employees e ON e.id=d.employee_id WHERE d.id={doc_id}")
        r = client.get(f"/api/employees/{owner}/documents/{doc_id}/download",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 404, r.text

    def test_employee_cannot_access_others_docs(self, client, emp_token, emp_code):
        r = client.get(f"/api/employees/{emp_code}/documents",
                       headers={"Authorization": f"Bearer {emp_token}"})
        assert r.status_code == 403, r.text

    def test_delete_document(self, client, hr_token, emp_code):
        r = client.post(
            f"/api/employees/{emp_code}/documents?doc_type=General",
            headers={"Authorization": f"Bearer {hr_token}"},
            files={"file": ("to_delete.pdf", b"temp", "application/pdf")},
        )
        assert r.status_code == 201, r.text
        doc_id = r.json()["id"]
        r2 = client.delete(f"/api/employees/{emp_code}/documents/{doc_id}",
                           headers={"Authorization": f"Bearer {hr_token}"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["message"] == "Document deleted"


# ---------------------------------------------------------------------------
# Reports RBAC
# ---------------------------------------------------------------------------

class TestReportsRBAC:
    AUTH = None  # placeholder

    def test_hr_attendance_report(self, client, hr_token):
        r = client.get("/api/reports/attendance", headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["filters"]["scope"] == "organization"
        assert isinstance(data["rows"], list)
        assert "late" in data
        assert "attendance_percentage" in data

    def test_hr_leave_report(self, client, hr_token):
        r = client.get("/api/reports/leaves", headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "days_taken" in data
        assert "approved" in data

    def test_hr_employee_report_with_salary(self, client, hr_token):
        r = client.get("/api/reports/employees", headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        assert r.json()["includes_salary"] is True

    def test_employee_report_own_scope_only(self, client, emp_token):
        r = client.get("/api/reports/employees", headers={"Authorization": f"Bearer {emp_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["includes_salary"] is False
        assert data["filters"]["scope"] == "self"

    def test_employee_cannot_view_others_attendance_report(self, client, emp_token):
        r = client.get("/api/reports/attendance?employee=EMP-1002",
                       headers={"Authorization": f"Bearer {emp_token}"})
        assert r.status_code in (403, 404), r.text

    def test_attendance_pdf_export(self, client, hr_token):
        r = client.get("/api/reports/attendance/export.pdf",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        assert "pdf" in r.headers.get("content-type", "")
        assert r.content[:5] == b"%PDF-"

    def test_leaves_pdf_export(self, client, hr_token):
        r = client.get("/api/reports/leaves/export.pdf",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        assert r.content[:5] == b"%PDF-"

    def test_employees_pdf_export(self, client, hr_token):
        r = client.get("/api/reports/employees/export.pdf",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        assert r.content[:5] == b"%PDF-"

    def test_attendance_report_invalid_date(self, client, hr_token):
        r = client.get("/api/reports/attendance?date_from=NOTADATE",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 400, r.text

    def test_attendance_report_date_range(self, client, hr_token):
        from_str = (dt.date.today() - dt.timedelta(days=7)).isoformat()
        to_str = dt.date.today().isoformat()
        r = client.get(f"/api/reports/attendance?date_from={from_str}&date_to={to_str}",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text

    def test_attendance_report_employee_filter(self, client, hr_token, emp_code):
        r = client.get(f"/api/reports/attendance?employee={emp_code}",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        if data["rows"]:
            assert data["rows"][0]["employee_id"] == emp_code

    def test_leave_report_status_filter(self, client, hr_token):
        r = client.get("/api/reports/leaves?status=APPROVED",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text

    def test_leave_report_invalid_status(self, client, hr_token):
        r = client.get("/api/reports/leaves?status=INVALID",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 400, r.text

    def test_employee_report_department_filter(self, client, hr_token):
        r = client.get("/api/reports/employees?department=Engineering",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text

    def test_unauthenticated_cannot_access_reports(self, client):
        r = client.get("/api/reports/attendance")
        assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------

class TestImports:
    def test_template_download(self, client, hr_token):
        r = client.get("/api/imports/template", headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
        assert "employee_id" in r.text or "email" in r.text

    def test_preview_valid_rows(self, client, hr_token):
        csv_data = _make_csv([
            {"email": f"{_rand('p3pv')}@example.com", "first_name": "Test", "last_name": "User",
             "department": "Engineering", "designation": "Dev", "joining_date": "2026-06-01",
             "employment_status": "Active", "salary": "100000"},
        ])
        r = client.post("/api/imports/preview",
                        headers={"Authorization": f"Bearer {hr_token}"},
                        files={"file": ("test.csv", csv_data, "text/csv")})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["valid_rows"] == 1
        assert data["invalid_rows"] == 0
        assert data["preview"][0]["valid"] is True

    def test_preview_duplicate_email(self, client, hr_token):
        csv_data = _make_csv([
            {"email": "dup@example.com", "first_name": "A", "last_name": "A",
             "department": "HR", "designation": "Manager", "joining_date": "2026-01-01",
             "employment_status": "Active", "salary": ""},
            {"email": "dup@example.com", "first_name": "B", "last_name": "B",
             "department": "HR", "designation": "Manager", "joining_date": "2026-01-01",
             "employment_status": "Active", "salary": ""},
        ])
        r = client.post("/api/imports/preview",
                        headers={"Authorization": f"Bearer {hr_token}"},
                        files={"file": ("test.csv", csv_data, "text/csv")})
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data.get("duplicates_in_file", [])) >= 1
        assert data["valid_rows"] == 1

    def test_preview_invalid_date(self, client, hr_token):
        csv_data = _make_csv([
            {"email": f"{_rand('p3bd')}@example.com", "first_name": "Bad", "last_name": "Date",
             "department": "HR", "designation": "Manager", "joining_date": "NOTADATE",
             "employment_status": "Active", "salary": ""},
        ])
        r = client.post("/api/imports/preview",
                        headers={"Authorization": f"Bearer {hr_token}"},
                        files={"file": ("test.csv", csv_data, "text/csv")})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["valid_rows"] == 0
        assert any("date" in e.lower() for row in data["preview"] for e in row["errors"])

    def test_preview_invalid_salary(self, client, hr_token):
        csv_data = _make_csv([
            {"email": f"{_rand('p3bs')}@example.com", "first_name": "Sal", "last_name": "Bad",
             "department": "HR", "designation": "Manager", "joining_date": "2026-01-01",
             "employment_status": "Active", "salary": "notanumber"},
        ])
        r = client.post("/api/imports/preview",
                        headers={"Authorization": f"Bearer {hr_token}"},
                        files={"file": ("test.csv", csv_data, "text/csv")})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["valid_rows"] == 0
        assert any("salary" in e.lower() for row in data["preview"] for e in row["errors"])

    def test_confirm_inserts_valid_rows(self, client, hr_token):
        email = f"{_rand('p3cf')}@example.com"
        csv_data = _make_csv([
            {"email": email, "first_name": "Confirm", "last_name": "Me",
             "department": "Engineering", "designation": "Dev", "joining_date": "2026-06-01",
             "employment_status": "Active", "salary": "100000"},
        ])
        r = client.post("/api/imports/confirm",
                        headers={"Authorization": f"Bearer {hr_token}"},
                        files={"file": ("test.csv", csv_data, "text/csv")})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["successful"] == 1, data
        assert data["failed"] == 0, data
        assert _sql(f"SELECT employee_id FROM employees WHERE email='{email}'") != ""

    def test_confirm_flags_db_duplicates(self, client, hr_token):
        email = f"{_rand('p3dd')}@example.com"
        csv_data = _make_csv([
            {"email": email, "first_name": "Dupe", "last_name": "A",
             "department": "HR", "designation": "Manager", "joining_date": "2026-06-01",
             "employment_status": "Active", "salary": ""},
        ])
        r1 = client.post("/api/imports/confirm",
                         headers={"Authorization": f"Bearer {hr_token}"},
                         files={"file": ("test.csv", csv_data, "text/csv")})
        assert r1.status_code == 200 and r1.json()["successful"] == 1

        r2 = client.post("/api/imports/confirm",
                         headers={"Authorization": f"Bearer {hr_token}"},
                         files={"file": ("test.csv", csv_data, "text/csv")})
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["successful"] == 0
        assert data["failed"] == 1
        assert any("uplicate" in f["error"] for f in data["failures"])

    def test_employee_cannot_import(self, client, emp_token):
        csv_data = _make_csv([
            {"email": "p3x@example.com", "first_name": "No", "last_name": "Import",
             "department": "HR", "designation": "Manager", "joining_date": "2026-06-01",
             "employment_status": "Active", "salary": ""},
        ])
        r = client.post("/api/imports/preview",
                        headers={"Authorization": f"Bearer {emp_token}"},
                        files={"file": ("test.csv", csv_data, "text/csv")})
        assert r.status_code == 403, r.text

    def test_template_employee_forbidden(self, client, emp_token):
        r = client.get("/api/imports/template", headers={"Authorization": f"Bearer {emp_token}"})
        assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# CSV Export hardening
# ---------------------------------------------------------------------------

class TestCSVExportHardening:
    def test_attendance_csv_invalid_date_returns_400(self, client, hr_token):
        r = client.get("/api/employees/export/attendance.csv?date_from=NOTADATE",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 400, r.text

    def test_attendance_csv_valid_dates(self, client, hr_token):
        from_str = (dt.date.today() - dt.timedelta(days=30)).isoformat()
        to_str = dt.date.today().isoformat()
        r = client.get(f"/api/employees/export/attendance.csv?date_from={from_str}&date_to={to_str}",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text

    def test_leaves_csv_date_filter(self, client, hr_token):
        from_str = (dt.date.today() - dt.timedelta(days=365)).isoformat()
        to_str = dt.date.today().isoformat()
        r = client.get(f"/api/employees/export/leaves.csv?date_from={from_str}&date_to={to_str}",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text

    def test_leaves_csv_invalid_status(self, client, hr_token):
        r = client.get("/api/employees/export/leaves.csv?status=INVALID",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 400, r.text

    def test_employees_csv_department_filter(self, client, hr_token):
        r = client.get("/api/employees/export/employees.csv?department=Engineering",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text

    def test_attendance_csv_department_filter(self, client, hr_token):
        r = client.get("/api/employees/export/attendance.csv?department=Engineering",
                       headers={"Authorization": f"Bearer {hr_token}"})
        assert r.status_code == 200, r.text
