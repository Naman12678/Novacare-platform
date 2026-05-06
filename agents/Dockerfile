FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e "."
COPY . .
RUN chmod +x start.sh
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8100/health || exit 1
CMD ["bash", "start.sh"]
