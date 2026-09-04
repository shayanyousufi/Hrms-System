# HRMS Database Schema Diagram

## Star Schema (ER Diagram)

```
                        ┌─────────────────┐
                        │   users          │
                        │─────────────────│
                        │ PK id           │
                        │    email [UQ]   │
                        │    password_hash│
                        │    phone        │
                        │    created_at   │
                        │    updated_at   │
                        └─────────────────┘

                        ┌─────────────────────┐
                        │   password_resets    │
                        │─────────────────────│
                        │ PK id               │
                        │    email            │
                        │    code             │
                        │    created_at       │
                        └─────────────────────┘


┌──────────────┐    ┌──────────────────────────────────────────────┐    ┌──────────────┐
│  attendance   │    │              EMPLOYEES (Center)              │    │  documents    │
│──────────────│    │──────────────────────────────────────────────│    │──────────────│
│ PK id        │◄──►│ PK id                                        │◄──►│ PK id        │
│ FK employee_id│   │    employee_id [UQ]                          │    │ FK employee_id│
│    date       │   │    first_name                                │    │    name       │
│    check_in   │   │    last_name                                 │    │    doc_type   │
│    check_out  │   │    email [UQ]                                │    │    file_url   │
│    status     │   │    phone                                     │    │    uploaded_at│
└──────────────┘    │    cnic                                      │    └──────────────┘
                    │    date_of_birth                             │
┌──────────────┐    │    gender                                    │
│ leave_records │   │    address                                   │
│──────────────│◄──►│    profile_picture                           │
│ PK id        │   │    emergency_contact_name                    │
│ FK employee_id│   │    emergency_contact_phone                   │
│    leave_type │   │    emergency_contact_relation                │
│    start_date │   │    department                                │
│    end_date   │   │    designation                               │
│    status     │   │    reporting_manager                         │
│    reason     │   │    joining_date                              │
└──────────────┘    │    employment_status                         │
                    │    salary                                    │
                    │    bank_account                              │
                    │    created_at                               │
                    │    updated_at                               │
                    └──────────────────────────────────────────────┘
                              ▲  ▲  ▲  ▲
                              │  │  │  │
                              │  │  │  └─── activity_logs
                              │  │  └────── employee_documents
                              │  └───────── leave_records
                              └──────────── attendance
```

## Relationships Summary

| Child Table | FK Column | References | Relationship |
|---|---|---|---|
| `attendance` | `employee_id` | `employees.id` | Many-to-One |
| `leave_records` | `employee_id` | `employees.id` | Many-to-One |
| `employee_documents` | `employee_id` | `employees.id` | Many-to-One |
| `activity_logs` | `employee_id` | `employees.id` | Many-to-One |

## Key Constraints

| Table | Column | Constraint |
|---|---|---|
| `users` | `email` | UNIQUE |
| `employees` | `employee_id` | UNIQUE |
| `employees` | `email` | UNIQUE |
| All tables | `id` | PRIMARY KEY (AUTOINCREMENT) |

## Frontend Page ↔ Database Table Mapping

| Frontend Page | Database Tables Used |
|---|---|
| **Employee List** (`/employees`) | `employees` |
| **Employee Detail** (`/employees/[id]`) | `employees` + `attendance` + `leave_records` + `activity_logs` |
| **Dashboard** (`/dashboard`) | `employees` (stats) + `attendance` + `activity_logs` |
| **Login** (`/login`) | `users` |
| **Register** (`/register`) | `users` |

## Table Details

### 1. users
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PRIMARY KEY |
| email | String(255) | UNIQUE, NOT NULL |
| password_hash | String(255) | NOT NULL |
| phone | String(20) | NULLABLE |
| created_at | DateTime | DEFAULT NOW() |
| updated_at | DateTime | DEFAULT NOW() |

### 2. password_resets
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PRIMARY KEY |
| email | String(255) | NOT NULL |
| code | String(6) | NOT NULL |
| created_at | DateTime | DEFAULT NOW() |

### 3. employees (Central Table)
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PRIMARY KEY |
| employee_id | String(20) | UNIQUE, NOT NULL |
| first_name | String(100) | NOT NULL |
| last_name | String(100) | NOT NULL |
| email | String(255) | UNIQUE, NOT NULL |
| phone | String(20) | NULLABLE |
| cnic | String(20) | NULLABLE |
| date_of_birth | Date | NULLABLE |
| gender | String(10) | NULLABLE |
| address | Text | NULLABLE |
| profile_picture | String(500) | NULLABLE |
| emergency_contact_name | String(200) | NULLABLE |
| emergency_contact_phone | String(20) | NULLABLE |
| emergency_contact_relation | String(50) | NULLABLE |
| department | String(100) | NOT NULL |
| designation | String(100) | NOT NULL |
| reporting_manager | String(200) | NULLABLE |
| joining_date | Date | NOT NULL |
| employment_status | String(20) | NOT NULL, DEFAULT 'Active' |
| salary | Numeric(12,2) | NULLABLE |
| bank_account | String(50) | NULLABLE |
| created_at | DateTime | DEFAULT NOW() |
| updated_at | DateTime | DEFAULT NOW() |

### 4. attendance
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PRIMARY KEY |
| employee_id | Integer | FOREIGN KEY → employees.id |
| date | Date | NOT NULL |
| check_in | String(10) | NULLABLE |
| check_out | String(10) | NULLABLE |
| status | String(20) | NOT NULL, DEFAULT 'Present' |

### 5. leave_records
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PRIMARY KEY |
| employee_id | Integer | FOREIGN KEY → employees.id |
| leave_type | String(50) | NOT NULL |
| start_date | Date | NOT NULL |
| end_date | Date | NOT NULL |
| status | String(20) | NOT NULL, DEFAULT 'Pending' |
| reason | Text | NULLABLE |

### 6. employee_documents
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PRIMARY KEY |
| employee_id | Integer | FOREIGN KEY → employees.id |
| name | String(200) | NOT NULL |
| doc_type | String(50) | NOT NULL |
| file_url | String(500) | NULLABLE |
| uploaded_at | DateTime | DEFAULT NOW() |

### 7. activity_logs
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PRIMARY KEY |
| employee_id | Integer | FOREIGN KEY → employees.id |
| action | String(200) | NOT NULL |
| performed_by | String(200) | NULLABLE |
| timestamp | DateTime | DEFAULT NOW() |
