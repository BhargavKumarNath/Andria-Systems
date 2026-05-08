.PHONY: install lint test clean

install:
	uv pip install -r requirements.txt || pip install -r requirements.txt

lint:
	ruff check src/ tests/ processing/
	ruff format src/ tests/ processing/

test:
	pytest tests/ -v --disable-warnings

clean:
	rm -rf .pytest_cache
	find . -type d -name "__pycache__" -exec rm -rf {} +
