# ClearPath AI — Hugging Face Space (Docker SDK)
# Multi-stage build: React dashboard + FastAPI inference API on port 7860.

# ---- Stage 1: Build React frontend ----
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python runtime ----
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-build /static ./static

ENV GRADIO_SERVER_NAME=0.0.0.0
EXPOSE 7860

RUN useradd -m -u 1000 spaceuser && chown -R spaceuser:spaceuser /app
USER spaceuser

# React dashboard + FastAPI (Gradio fallback: python app.py)
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "7860"]
