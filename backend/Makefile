.PHONY: dev db migrate test sim

# 8001: Woddie/Salvie dev servers use 8000. 0.0.0.0 so a phone on the LAN can reach it.
dev:
	uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

db:
	docker compose -f ../docker-compose.yml up -d --wait db

migrate:
	uv run alembic upgrade head

test:
	uv run pytest -q

sim:
	uv run python -m app.engine.simulate --games 200 --players 4
