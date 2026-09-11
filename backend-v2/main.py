from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.deps import get_current_user
from app.routes.auth import router as auth_router
from app.routes.employees import router as employees_router
from app.routes.attendance import router as attendance_router
from app.routes.reports import router as reports_router
from app.routes.imports import router as imports_router

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
app.include_router(reports_router)
app.include_router(imports_router)


@app.on_event("startup")
async def startup():
    # Run all Alembic migrations to bring the schema up to date.
    # env.py uses asyncio.run() internally, so it must run on a worker thread
    # (never on the running event loop).
    import asyncio

    def _run_migrations() -> None:
        from alembic import command
        from alembic.config import Config

        cfg = Config("alembic.ini")
        cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
        command.upgrade(cfg, "head")

    try:
        await asyncio.wait_for(asyncio.to_thread(_run_migrations), timeout=60)
    except Exception as exc:  # pragma: no cover - startup diagnostics
        import logging
        logging.getLogger("uvicorn.error").error(f"Startup migration failed: {exc}")


@app.exception_handler(Exception)
async def _global_exc_handler(request, exc):
    import traceback, os, datetime
    logdir = r"C:\Users\Moon\AppData\Local\Temp\opencode"
    os.makedirs(logdir, exist_ok=True)
    with open(os.path.join(logdir, "exc_trace.log"), "a", encoding="utf-8") as f:
        f.write(f"\n===== {datetime.datetime.now()} path={request.url.path}\n")
        f.write(traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.get("/", dependencies=[Depends(get_current_user)])
async def root():
    return {"message": "Tech Land Auth API"}


# Development-only diagnostic endpoint. Never registered in production.
if settings.ENVIRONMENT != "production":

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
