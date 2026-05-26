FROM python:3.12-slim

# System packages for C-extension ML deps (scipy, umap-learn, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source and install (non-editable for Docker)
COPY pyproject.toml README.md ./
COPY andria/ ./andria/
RUN pip install --no-cache-dir .

# HF Spaces requires the app on port 7860
EXPOSE 7860

CMD ["andria", "serve", "--port", "7860", "--host", "0.0.0.0"]
