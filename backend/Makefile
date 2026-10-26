.PHONY: test sim

test:
	uv run pytest -q

sim:
	uv run python -m app.engine.simulate --games 200 --players 4
