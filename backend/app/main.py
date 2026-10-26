from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import engine
from app.routers import auth, tables, users
from app.services.tables import TableError

# The schema is owned by Alembic (start.sh runs `alembic upgrade head` before
# uvicorn); the app never calls create_all, so code and migrations can't drift.


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="Buraco API", version="0.1.0", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tables.router)
app.add_exception_handler(TableError, tables.table_error_handler)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    """Liveness only: no DB call, so a cold start from zero replicas answers fast."""
    return {"status": "ok", "service": "buraco-backend"}
