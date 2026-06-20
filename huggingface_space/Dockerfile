# ClearPath AI — Hugging Face Space (Docker SDK)
# Builds a container that serves the Gradio dashboard on the port HF Spaces expects.

FROM python:3.10-slim

# System libs needed by lightgbm / xgboost wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Hugging Face Spaces (Docker SDK) routes traffic to port 7860 by default
ENV GRADIO_SERVER_NAME=0.0.0.0
ENV GRADIO_SERVER_PORT=7860
EXPOSE 7860

# Run as a non-root user (Spaces requirement for Docker SDK)
RUN useradd -m -u 1000 spaceuser
USER spaceuser

CMD ["python", "app.py"]
