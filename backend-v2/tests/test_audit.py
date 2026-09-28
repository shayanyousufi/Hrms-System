"""Audit log integration tests.

Tests:
  - Role change creates audit log entry
  - Bulk role change creates audit log entry
  - SUPER_ADMIN can list audit logs
  - Non-SUPER_ADMIN cannot list audit logs
  - Audit log entry contains correct old/new values
"""
import random
import string

import httpx
import pytest

BASE = "http://127.0.0.1:8001"


def _rand(tag: str) -> str:
    return f"{tag}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"


def _http() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=60.0)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def client():
    with _http() as c:
        yield c


@pytest.fixture(scope="module")
def super_admin(client):
    r = client.post("/api/auth/login", json={"email": "shayan.yousufi07@gmail.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return {"token": r.json()["access_token"], "user_id": r.json()["user"]["id"]}


@pytest.fixture(scope="module")
def hr_user(client):
    email = f"audit_hr_{_rand('hr')}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "ReusablePass1"})
    user_id = r.json()["user"]["id"]
    # Promote to HR via raw SQL
    import subprocess, os
    env = dict(os.environ, PGPASSWORD="SK_7")
    subprocess.run([
        r"C:\Program Files\PostgreSQL\18\bin\psql.exe", "-U", "postgres", "-d", "techland", "-t", "-A", "-c",
        f"DELETE FROM user_roles WHERE user_id = {user_id};"
        f"INSERT INTO user_roles (user_id, role_id) VALUES ({user_id}, (SELECT id FROM roles WHERE name='HR'));"
    ], capture_output=True, text=True, env=env, timeout=10)
    r = client.post("/api/auth/login", json={"email": email, "password": "ReusablePass1"})
    assert r.status_code == 200, r.text
    return {"token": r.json()["access_token"], "user_id": user_id, "email": email}


@pytest.fixture(scope="module")
def target_user(client):
    email = f"audit_target_{_rand('tgt')}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "ReusablePass1"})
    assert r.status_code in (200, 201), r.text
    return {"token": r.json()["access_token"], "user_id": r.json()["user"]["id"], "email": email}


class TestAuditLogRBAC:
    def test_employee_cannot_list_logs(self, client, target_user):
        r = client.get("/api/audit-logs", headers=_auth(target_user["token"]))
        assert r.status_code == 403

    def test_hr_cannot_list_logs(self, client, hr_user):
        r = client.get("/api/audit-logs", headers=_auth(hr_user["token"]))
        assert r.status_code == 403

    def test_super_admin_can_list_logs(self, client, super_admin):
        r = client.get("/api/audit-logs", headers=_auth(super_admin["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestAuditLogEntries:
    def test_role_replace_creates_log(self, client, super_admin, target_user):
        uid = target_user["user_id"]
        # Change role to MANAGER
        r = client.patch(
            f"/api/auth/users/{uid}/role",
            json={"role": "MANAGER"},
            headers=_auth(super_admin["token"]),
        )
        assert r.status_code == 200, r.text

        # Check audit log
        r2 = client.get(f"/api/audit-logs?target_id={uid}", headers=_auth(super_admin["token"]))
        assert r2.status_code == 200
        logs = r2.json()
        assert len(logs) >= 1
        latest = logs[0]
        assert latest["action"] == "role_replaced"
        assert latest["target_user_id"] == uid
        assert latest["target_email"] == target_user["email"]
        assert latest["new_value"] == "MANAGER"

    def test_bulk_role_update_creates_log(self, client, super_admin, target_user):
        uid = target_user["user_id"]
        r = client.patch(
            f"/api/auth/users/{uid}/roles",
            json={"roles": ["EMPLOYEE", "MANAGER"]},
            headers=_auth(super_admin["token"]),
        )
        assert r.status_code == 200, r.text

        r2 = client.get(f"/api/audit-logs?target_id={uid}", headers=_auth(super_admin["token"]))
        assert r2.status_code == 200
        logs = r2.json()
        bulk_logs = [l for l in logs if l["action"] == "roles_bulk_updated"]
        assert len(bulk_logs) >= 1
        assert "EMPLOYEE" in bulk_logs[0]["new_value"]
        assert "MANAGER" in bulk_logs[0]["new_value"]

    def test_action_types_endpoint(self, client, super_admin):
        r = client.get("/api/audit-logs/actions", headers=_auth(super_admin["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
