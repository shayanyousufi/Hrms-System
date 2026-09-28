"""
Seed script for Tech Land HRMS — generates realistic employee data.

Usage:
    python scripts/seed_employees.py              # Seed 100 employees (skips if exists)
    python scripts/seed_employees.py --clear      # Delete all data then re-seed
    python scripts/seed_employees.py --count 50   # Seed only 50 employees
"""

import asyncio
import argparse
import random
import string
from datetime import date, timedelta

import asyncpg
import bcrypt
from faker import Faker

fake = Faker("en_PK")
Faker.seed(42)
random.seed(42)

DB_DSN = "postgresql://postgres:SK_7@localhost:5432/techland"
DEFAULT_PASSWORD = "Employee@123"
ADMIN_USER_IDS = [1, 13, 22]

DEPARTMENTS = {
    "Engineering": ["Software Engineer", "Senior Software Engineer", "Tech Lead", "Junior Software Engineer"],
    "HR": ["HR Officer", "HR Manager", "HR Coordinator"],
    "Marketing": ["Marketing Specialist", "Marketing Manager", "Content Writer"],
    "Finance": ["Accountant", "Finance Manager", "Financial Analyst"],
    "Operations": ["Operations Coordinator", "Operations Manager", "Logistics Officer"],
    "Sales": ["Sales Executive", "Sales Manager", "Business Development Officer"],
    "IT": ["IT Support Specialist", "IT Manager", "System Administrator"],
    "Admin": ["Admin Officer", "Admin Manager", "Office Assistant"],
}

SALARY_RANGES = {
    "Junior Software Engineer": (40000, 65000),
    "Software Engineer": (65000, 110000),
    "Senior Software Engineer": (110000, 170000),
    "Tech Lead": (140000, 200000),
    "HR Officer": (50000, 80000),
    "HR Manager": (100000, 160000),
    "HR Coordinator": (40000, 60000),
    "Marketing Specialist": (50000, 85000),
    "Marketing Manager": (100000, 150000),
    "Content Writer": (35000, 60000),
    "Accountant": (55000, 90000),
    "Finance Manager": (110000, 180000),
    "Financial Analyst": (60000, 100000),
    "Operations Coordinator": (40000, 65000),
    "Operations Manager": (100000, 160000),
    "Logistics Officer": (45000, 70000),
    "Sales Executive": (40000, 75000),
    "Sales Manager": (100000, 170000),
    "Business Development Officer": (55000, 95000),
    "IT Support Specialist": (45000, 75000),
    "IT Manager": (110000, 175000),
    "System Administrator": (60000, 100000),
    "Admin Officer": (40000, 65000),
    "Admin Manager": (90000, 150000),
    "Office Assistant": (30000, 45000),
}

CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Peshawar", "Multan", "Quetta"]
GENDERS = ["Male", "Female"]
LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Annual Leave", "Unpaid Leave"]
LEAVE_STATUSES = ["Approved", "Rejected", "Pending"]
ATTENDANCE_STATUSES = ["Present", "Present", "Present", "Present", "Present",
                       "Present", "Present", "Present", "Late", "Late",
                       "Absent", "Leave"]


def gen_employee_id(n: int) -> str:
    return f"EMP{n:03d}"


def gen_phone() -> str:
    prefix = random.choice(["0300", "0301", "0302", "0303", "0304", "0305",
                            "0306", "0307", "0308", "0309", "0310", "0311",
                            "0312", "0313", "0314", "0315", "0316", "0317",
                            "0318", "0319", "0320", "0321", "0322", "0323",
                            "0324", "0325", "0333", "0334", "0335", "0336"])
    return f"{prefix}-{random.randint(1000000, 9999999)}"


def gen_cnic() -> str:
    area = random.randint(10000, 99999)
    serial = random.randint(1000000, 9999999)
    check = random.randint(0, 9)
    return f"{area}-{serial}-{check}"


def gen_bank_account() -> str:
    bank = random.choice(["0012", "0014", "0019", "0026", "0030", "0042", "0053", "0061"])
    return f"{bank}-{random.randint(10000000000000, 99999999999999)}"


def working_days_back(n: int) -> list[date]:
    days = []
    d = date.today()
    while len(days) < n:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            days.append(d)
    days.reverse()
    return days


async def clear_all(c: asyncpg.Connection):
    print("Clearing existing data...")
    for table in ["payslip_allowances", "payslip_deductions", "payslips",
                   "payroll_runs", "audit_logs", "password_resets",
                   "activity_logs", "employee_documents", "tasks", "meetings",
                   "leave_records", "attendance", "employees", "user_roles"]:
        await c.execute(f"DELETE FROM {table}")
    # Delete non-admin users
    placeholders = ", ".join(f"${i+1}" for i in range(len(ADMIN_USER_IDS)))
    await c.execute(f"DELETE FROM users WHERE id NOT IN ({placeholders})", *ADMIN_USER_IDS)
    print("  Done.")


async def seed(count: int):
    c = await asyncpg.connect(DB_DSN)

    # Check if already seeded
    existing = await c.fetchval("SELECT count(*) FROM employees")
    if existing > 0:
        print(f"Database already has {existing} employees. Use --clear to reset.")
        await c.close()
        return

    pwd_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()

    # Get role IDs
    roles = {}
    for row in await c.fetch("SELECT id, name FROM roles"):
        roles[row["name"]] = row["id"]

    # Build department -> employees distribution
    dept_names = list(DEPARTMENTS.keys())
    employees_per_dept = count // len(dept_names)
    remainder = count % len(dept_names)
    dept_counts = {}
    for i, dept in enumerate(dept_names):
        dept_counts[dept] = employees_per_dept + (1 if i < remainder else 0)

    # Generate employee data
    employees = []
    used_emails = set()
    used_phones = set()

    for dept_name, designations in DEPARTMENTS.items():
        n = dept_counts[dept_name]
        for i in range(n):
            first = fake.first_name_male() if random.random() < 0.6 else fake.first_name_female()
            last = fake.last_name()
            gender = random.choice(GENDERS)

            # Ensure unique email
            base_email = f"{first.lower()}.{last.lower()}"
            email = f"{base_email}@techland.com"
            suffix = 1
            while email in used_emails:
                email = f"{base_email}{suffix}@techland.com"
                suffix += 1
            used_emails.add(email)

            # Ensure unique phone
            phone = gen_phone()
            while phone in used_phones:
                phone = gen_phone()
            used_phones.add(phone)

            # Designation: first employee in dept is manager
            is_manager = (i == 0)
            designation = designations[0] if is_manager else random.choice(designations[1:])

            # Salary
            lo, hi = SALARY_RANGES.get(designation, (40000, 100000))
            salary = round(random.uniform(lo, hi), 2)

            # Joining date: random in last 5 years
            start = date(2020, 1, 1)
            end = date(2025, 6, 1)
            joining = start + timedelta(days=random.randint(0, (end - start).days))

            # DOB: 22-55 years old
            today = date.today()
            dob = today - timedelta(days=random.randint(22 * 365, 55 * 365))

            # Status
            status_roll = random.random()
            status = "Active" if status_roll < 0.90 else ("On Leave" if status_roll < 0.95 else "Inactive")

            city = random.choice(CITIES)
            emp_id = gen_employee_id(len(employees) + 1)

            employees.append({
                "emp_id": emp_id,
                "first_name": first,
                "last_name": last,
                "email": email,
                "phone": phone,
                "cnic": gen_cnic(),
                "dob": dob,
                "gender": gender,
                "address": f"{fake.street_address()}, {city}",
                "department": dept_name,
                "designation": designation,
                "joining_date": joining,
                "status": status,
                "salary": salary,
                "bank_account": gen_bank_account(),
                "leave_balance": random.randint(5, 20),
                "is_manager": is_manager,
                "manager_name": None,
                "user_id": None,
            })

    # Assign managers: each non-manager gets a manager from same dept
    dept_managers = {}
    for emp in employees:
        dept = emp["department"]
        if emp["is_manager"]:
            dept_managers[dept] = emp
        elif dept not in dept_managers:
            dept_managers[dept] = emp

    for emp in employees:
        if not emp["is_manager"]:
            mgr = dept_managers.get(emp["department"])
            if mgr:
                emp["manager_name"] = f"{mgr['first_name']} {mgr['last_name']}"

    # Insert employees + user accounts + roles
    print(f"Creating {count} employees...")
    emp_ids = {}  # emp_id -> db id
    manager_db_ids = {}  # emp_id -> db id for manager linking

    for idx, emp in enumerate(employees):
        # Create user account
        user_id = await c.fetchval(
            """INSERT INTO users (email, password_hash, phone)
               VALUES ($1, $2, $3) RETURNING id""",
            emp["email"], pwd_hash, emp["phone"]
        )

        # Assign role
        role_name = "MANAGER" if emp["is_manager"] else "EMPLOYEE"
        await c.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
            user_id, roles[role_name]
        )

        # Insert employee
        emp_db_id = await c.fetchval(
            """INSERT INTO employees
               (employee_id, user_id, first_name, last_name, email, phone,
                cnic, date_of_birth, gender, address,
                department, designation, joining_date, employment_status,
                salary, bank_account, leave_balance)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
               RETURNING id""",
            emp["emp_id"], user_id, emp["first_name"], emp["last_name"],
            emp["email"], emp["phone"], emp["cnic"], emp["dob"],
            emp["gender"], emp["address"], emp["department"],
            emp["designation"], emp["joining_date"], emp["status"],
            emp["salary"], emp["bank_account"], emp["leave_balance"]
        )

        emp_ids[emp["emp_id"]] = emp_db_id
        if emp["is_manager"]:
            manager_db_ids[emp["emp_id"]] = emp_db_id

        if (idx + 1) % 20 == 0 or (idx + 1) == count:
            print(f"  Inserted {idx + 1}/{count}")

    # Update manager_id for non-managers
    print("Assigning managers...")
    for emp in employees:
        if not emp["is_manager"]:
            emp_db_id = emp_ids[emp["emp_id"]]
            dept = emp["department"]
            mgr = dept_managers.get(dept)
            if mgr and mgr["emp_id"] in emp_ids:
                mgr_db_id = emp_ids[mgr["emp_id"]]
                await c.execute(
                    "UPDATE employees SET manager_id = $1 WHERE id = $2",
                    mgr_db_id, emp_db_id
                )

    # Generate attendance (last 20 working days)
    print("Generating attendance records...")
    work_days = working_days_back(20)
    attendance_count = 0
    for emp in employees:
        emp_db_id = emp_ids[emp["emp_id"]]
        if emp["status"] != "Active":
            continue
        for day in work_days:
            status = random.choice(ATTENDANCE_STATUSES)
            check_in = None
            check_out = None
            if status in ("Present", "Late"):
                hour = random.choice([8, 9, 10]) if status == "Present" else random.choice([10, 11])
                check_in = f"{hour:02d}:{random.choice(['00','15','30','45'])}"
                out_hour = random.choice([17, 18])
                check_out = f"{out_hour:02d}:{random.choice(['00','15','30','45'])}"
            await c.execute(
                """INSERT INTO attendance (employee_id, date, check_in, check_out, status)
                   VALUES ($1, $2, $3, $4, $5)""",
                emp_db_id, day, check_in, check_out, status
            )
            attendance_count += 1
    print(f"  Created {attendance_count} attendance records")

    # Generate leaves (0-3 per active employee)
    print("Generating leave records...")
    leave_count = 0
    for emp in employees:
        emp_db_id = emp_ids[emp["emp_id"]]
        if emp["status"] != "Active":
            continue
        n_leaves = random.choices([0, 1, 2, 3], weights=[50, 30, 15, 5])[0]
        for _ in range(n_leaves):
            leave_type = random.choice(LEAVE_TYPES)
            start = date.today() - timedelta(days=random.randint(1, 90))
            duration = random.randint(1, 5)
            end = start + timedelta(days=duration)
            status = random.choice(LEAVE_STATUSES)
            reason = fake.sentence(nb_words=6)
            await c.execute(
                """INSERT INTO leave_records (employee_id, leave_type, start_date, end_date, status, reason)
                   VALUES ($1, $2, $3, $4, $5, $6)""",
                emp_db_id, leave_type, start, end, status, reason
            )
            leave_count += 1
    print(f"  Created {leave_count} leave records")

    # Summary
    print(f"\n=== Seed Complete ===")
    print(f"  Employees: {count}")
    print(f"  Users: {count} (all login: email / {DEFAULT_PASSWORD})")
    print(f"  Attendance: {attendance_count} records")
    print(f"  Leaves: {leave_count} records")

    # Print sample accounts
    print(f"\n=== Sample Login Accounts ===")
    print(f"  Admin:    shayan.yousufi07@gmail.com / Admin@123")
    print(f"  Manager:  {employees[0]['email']} / {DEFAULT_PASSWORD}")
    non_mgr = next(e for e in employees if not e["is_manager"])
    print(f"  Employee: {non_mgr['email']} / {DEFAULT_PASSWORD}")

    await c.close()


def main():
    parser = argparse.ArgumentParser(description="Seed Tech Land HRMS database")
    parser.add_argument("--clear", action="store_true", help="Delete all data before seeding")
    parser.add_argument("--count", type=int, default=100, help="Number of employees (default: 100)")
    args = parser.parse_args()

    async def run():
        c = await asyncpg.connect(DB_DSN)
        if args.clear:
            await clear_all(c)
        await c.close()
        await seed(args.count)

    asyncio.run(run())


if __name__ == "__main__":
    main()
