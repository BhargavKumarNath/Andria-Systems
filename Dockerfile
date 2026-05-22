FROM python:3.12-slim

# Set up non-root user required by Hugging Face Spaces
RUN useradd -m -u 1000 user

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy configuration files
COPY pyproject.toml README.md ./

# Install python dependencies without copying the entire codebase first
RUN pip install --no-cache-dir . uvicorn

# Copy application source code
COPY andria/ ./andria/
COPY configs/ ./configs/

# Give ownership to the non-root user
RUN chown -R user:user /app

# Switch to the non-root user
USER user

EXPOSE 8050

# Execute uvicorn server directly instead of gunicorn
CMD ["uvicorn", "andria.api.main:app", "--host", "0.0.0.0", "--port", "8050"]
