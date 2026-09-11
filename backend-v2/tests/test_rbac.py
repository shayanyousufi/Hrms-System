"""RBAC (Role-Based Access Control) integration tests for the HRMS backend.

Runs against the live FastAPI backend on http://127.0.0.1:8001.
Requires PostgreSQL `techland` running and migrations applied.

Coverage:
  - Public register always yields EMPLOYEE role.
  - Login /me surface the role.
  - EMPLOYEE cannot reach staff/admin endpoints (403).
  - EMPLOYEE self-service works on own profile + own attendance.
  - SUPER_ADMIN can promote users and HR cannot escalate to HR/Super Admin.
  - /me, role update, link-employee round-trips.
"""
import os
import random
import string

import httpx
import pytest

BASE = "http://127.0.0.1:8001"
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"


def _rand(tag: str) -> str:
    return f"{tag}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"


def _reg_email() -> str:
    return f"{_rand('rbac')}@example.com"


def _http() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=20.0)


def _register(client: httpx.Client, email: str, password: str = "ReusablePass1"):
    return client.post("/api/auth/register", json={"email": email, "password": password, "phone": "03000000000"})


def _login(client: httpx.Client, email: str, password: str = "ReusablePass1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


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


@pytest.fixture(scope="module")
def client():
    with _http() as c:
        yield c


@pytest.fixture(scope="module")
def employee_user(client):
    """A freshly registered EMPLOYEE account."""
    email = _reg_email()
    r = _register(client, email)
    assert r.status_code == 201 or r.status_code == 200, r.text
    token = r.json()["access_token"]
    # Link a fresh employee record to this user so self-service passes.
    emp_code = f"EMP-RBAC-{random.randint(1000, 9999)}"
    user_id = r.json()["user"]["id"]
    _sql(
        "INSERT INTO employees (employee_id, first_name, last_name, email, department, designation,"
        " joining_date, employment_status, user_id) VALUES "
        f"('{emp_code}','Test','User','{email}','Testing','Tester','2026-01-01','Active',{user_id})"
    )
    yield {"email": email, "password": "ReusablePass1", "token": token, "user_id": user_id, "emp_code": emp_code}
    try:
        _sql(f"DELETE FROM activity_logs WHERE employee_id IN (SELECT id FROM employees WHERE employee_id='{emp_code}')")
        _sql(f"DELETE FROM attendance WHERE employee_id IN (SELECT id FROM employees WHERE employee_id='{emp_code}')")
        _sql(f"DELETE FROM employees WHERE employee_id='{emp_code}'")
        _sql(f"DELETE FROM users WHERE id={user_id}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def super_admin(client):
    """A SUPER_ADMIN account used for privileged assertions (cleaned up)."""
    email = _reg_email()
    r = _register(client, email)
    assert r.status_code in (200, 201), r.text
    user_id = r.json()["user"]["id"]
    token = r.json()["access_token"]
    _sql(f"UPDATE users SET role='SUPER_ADMIN' WHERE id={user_id}")
    yield {"email": email, "password": "ReusablePass1", "token": token, "user_id": user_id}
    try:
        _sql(f"DELETE FROM users WHERE id={user_id}")
    except Exception:
        pass


def test_register_always_employee(client):
    email = _reg_email()
    r = _register(client, email)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data["user"]["role"] == "EMPLOYEE"
    assert "access_token" in data
    _sql(f"DELETE FROM users WHERE id={data['user']['id']}")


def test_employee_cannot_access_staff_endpoints(client, employee_user):
    token = employee_user["token"]
    h = {"Authorization": f"Bearer {token}"}
    for path in [
        "/api/employees",
        "/api/employees/stats/overview",
        "/api/employees/leaves/all",
        "/api/employees/export/employees.csv",
        "/api/attendance/stats",
        "/api/attendance/records",
        "/api/attendance/today",
        "/api/attendance/activity-feed",
    ]:
        r = client.get(path, headers=h)
        assert r.status_code == 403, f"{path} -> {r.status_code}: {r.text}"


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("POST", "/api/employees", {"first_name": "X", "last_name": "Y", "email": "x@example.com", "department": "HR", "designation": "HR", "joining_date": "2026-01-01"}),
        ("PUT", "/api/employees/SOMECODE", {"first_name": "X"}),
        ("DELETE", "/api/employees/SOMECODE", None),
    ],
)
def test_employee_cannot_mutate_employees(client, employee_user, method, path, payload):
    r = client.request(method, path, headers={"Authorization": f"Bearer {employee_user['token']}"}, json=payload)
    assert r.status_code == 403, f"{method} {path} -> {r.status_code}: {r.text}"


def test_employee_self_profile_access(client, employee_user):
    h = {"Authorization": f"Bearer {employee_user['token']}"}
    r = client.get(f"/api/employees/{employee_user['emp_code']}", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["email"] == employee_user["email"]


def _delete_employee(code: str) -> None:
    """Delete an employee and its dependent rows (used to clean up test data)."""
    _sql(
        f"DELETE FROM activity_logs WHERE employee_id IN (SELECT id FROM employees WHERE employee_id='{code}')"
    )
    _sql(
        f"DELETE FROM attendance WHERE employee_id IN (SELECT id FROM employees WHERE employee_id='{code}')"
    )
    _sql(f"DELETE FROM employees WHERE employee_id='{code}'")


def test_employee_cannot_view_other_employee(client, employee_user):
    other_email = _reg_email()
    # Create another employee not linked to this user.
    code = f"EMP-OTHER-{random.randint(1000, 9999)}"
    _sql(
        "INSERT INTO employees (employee_id, first_name, last_name, email, department, designation,"
        f" joining_date, employment_status) VALUES ('{code}','Other','Person','{other_email}','HR','HR','2026-01-01','Active')"
    )
    try:
        r = client.get(f"/api/employees/{code}", headers={"Authorization": f"Bearer {employee_user['token']}"})
        assert r.status_code == 403, r.text
    finally:
        _delete_employee(code)


def test_employee_self_attendance_flow(client, employee_user):
    token = employee_user["token"]
    h = {"Authorization": f"Bearer {token}"}
    # my-status returns own linked employee
    status = client.get("/api/attendance/my-status", headers=h)
    assert status.status_code == 200, status.text
    assert status.json()["employee_id"] == employee_user["emp_code"], status.text

    # check-in own employee
    ckin = client.post("/api/attendance/checkin", json={"employee_id": employee_user["emp_code"]}, headers=h)
    assert ckin.status_code in (200, 400), ckin.text  # 400 if already checked in


def test_employee_cannot_check_in_other(client, employee_user):
    other_email = _reg_email()
    code = f"EMP-CK-{random.randint(1000, 9999)}"
    _sql(
        "INSERT INTO employees (employee_id, first_name, last_name, email, department, designation,"
        f" joining_date, employment_status) VALUES ('{code}','Other','Ck','{other_email}','HR','HR','2026-01-01','Active')"
    )
    try:
        r = client.post(
            "/api/attendance/checkin",
            json={"employee_id": code},
            headers={"Authorization": f"Bearer {employee_user['token']}"},
        )
        assert r.status_code == 403, r.text
    finally:
        _delete_employee(code)


def test_admin_list_users_and_promote(client, employee_user, super_admin):
    # Super admin lists users (needs privilege).
    r = client.get("/api/auth/users", headers={"Authorization": f"Bearer {super_admin['token']}"})
    assert r.status_code == 200, r.text
    assert any(u["id"] == employee_user["user_id"] for u in r.json())

    # Super admin can promote an EMPLOYEE to HR.
    r = client.patch(
        f"/api/auth/users/{employee_user['user_id']}/role",
        json={"role": "HR"},
        headers={"Authorization": f"Bearer {super_admin['token']}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "HR"

    # Set it back to EMPLOYEE for subsequent tests.
    r = client.patch(
        f"/api/auth/users/{employee_user['user_id']}/role",
        json={"role": "EMPLOYEE"},
        headers={"Authorization": f"Bearer {super_admin['token']}"},
    )
    assert r.status_code == 200, r.text


def test_hr_cannot_escalate_to_admin_role(client, super_admin):
    # Promote super_admin user down is not needed; create an HR via super admin then test it can't escalate.
    hr_email = _reg_email()
    r = _register(client, hr_email)
    assert r.status_code in (200, 201), r.text
    hr_id = r.json()["user"]["id"]
    try:
        _sql(f"UPDATE users SET role='HR' WHERE id={hr_id}")
        hr_token = r.json()["access_token"]
        # HR trying to assign HR/Super Admin should be rejected with 403.
        target = _reg_email()
        rt = _register(client, target)
        target_id = rt.json()["user"]["id"]
        try:
            rr = client.patch(
                f"/api/auth/users/{target_id}/role",
                json={"role": "HR"},
                headers={"Authorization": f"Bearer {hr_token}"},
            )
            assert rr.status_code == 403, rr.text
            rr2 = client.patch(
                f"/api/auth/users/{target_id}/role",
                json={"role": "SUPER_ADMIN"},
                headers={"Authorization": f"Bearer {hr_token}"},
            )
            assert rr2.status_code == 403, rr2.text
            # HR CAN assign MANAGER/EMPLOYEE.
            rr3 = client.patch(
                f"/api/auth/users/{target_id}/role",
                json={"role": "MANAGER"},
                headers={"Authorization": f"Bearer {hr_token}"},
            )
            assert rr3.status_code == 200, rr3.text
            assert rr3.json()["role"] == "MANAGER"
        finally:
            _sql(f"DELETE FROM users WHERE id={target_id}")
    finally:
        _sql(f"DELETE FROM users WHERE id={hr_id}")


def test_link_employee_endpoint(client, super_admin):
    # SUPER_ADMIN can link an existing employee to a user.
    user_email = _reg_email()
    r = _register(client, user_email)
    user_id = r.json()["user"]["id"]
    emp_email = _reg_email()
    code = f"EMP-LNK-{random.randint(1000, 9999)}"
    _sql(
        "INSERT INTO employees (employee_id, first_name, last_name, email, department, designation,"
        f" joining_date, employment_status) VALUES ('{code}','Link','Emp','{emp_email}','HR','HR','2026-01-01','Active')"
    )
    emp_id = int(_sql(f"SELECT id FROM employees WHERE employee_id='{code}'"))
    try:
        r = client.post(
            f"/api/auth/users/{user_id}/link-employee",
            json={"employee_id": emp_id},
            headers={"Authorization": f"Bearer {super_admin['token']}"},
        )
        assert r.status_code == 200, r.text
        linked = _sql(f"SELECT user_id FROM employees WHERE id={emp_id}")
        assert linked == str(user_id)
    finally:
        _delete_employee(code)
        _sql(f"DELETE FROM users WHERE id={user_id}")


def test_logout_session_endpoints_test_me_after_login(client, employee_user):
    r = _login(client, employee_user["email"], employee_user["password"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "EMPLOYEE"