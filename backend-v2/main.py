from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.core.deps import get_current_user
from app.routes.auth import router as auth_router
from app.routes.employees import router as employees_router
from app.routes.attendance import router as attendance_router

app = FastAPI(title="Tech Land HRMS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(employees_router)
app.include_router(attendance_router)


@app.on_event("startup")
async def startup():
    from app.models.employee import Employee, Attendance, LeaveRecord, EmployeeDocument, ActivityLog, Task, Meeting
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.get("/", dependencies=[Depends(get_current_user)])
async def root():
    return {"message": "Tech Land Auth API"}


@app.get("/db", dependencies=[Depends(get_current_user)])
async def view_database():
    from sqlalchemy import text
    from app.core.database import async_session
    async with async_session() as db:
        tables = {}
        result = await db.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
        table_names = [r[0] for r in result.fetchall()]
        for tname in table_names:
            cols = await db.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{tname}' AND table_schema='public' ORDER BY ordinal_position"))
            columns = [{"name": c[0], "type": c[1]} for c in cols.fetchall()]
            rows = await db.execute(text(f'SELECT * FROM "{tname}"'))
            data = [dict(zip([c["name"] for c in columns], [str(v) if v is not None else None for v in row])) for row in rows.fetchall()]
            tables[tname] = {"columns": columns, "rows": data, "count": len(data)}
        return {"database": "techland (PostgreSQL)", "total_tables": len(tables), "tables": tables}
