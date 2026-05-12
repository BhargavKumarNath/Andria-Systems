FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY andria/ ./andria/
COPY artifacts/ ./artifacts/
COPY configs/ ./configs/
COPY wsgi.py ./

RUN pip install --no-cache-dir .
RUN pip install gunicorn

EXPOSE 8050
ENV PORT=8050

CMD ["gunicorn", "--bind", "0.0.0.0:8050", "wsgi:server", "--workers", "1", "--threads", "4", "--timeout", "120"]
