---
title: ClearPath AI — BTP Road Closure Risk Engine
emoji: 🚦
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# ClearPath AI

Inference-only console for the **ClearPath AI** road-closure risk model, built on Bengaluru
Traffic Police's ASTraM event log for **PS-2, Gridlock Hackathon 2.0**.

## Dashboard

This Space ships a **React operations dashboard** (light theme, institutional styling) served
by FastAPI on port 7860:

- **Live Risk Prediction** — score new ASTraM events via `POST /api/predict`
- **Hotspot Map** — Bengaluru event map filtered by type and risk tier
- **Dispatch Plan** — sortable Tier 3+ action list
- **Model Insights** — SHAP, temporal CV, calibration, segment performance
- **System Health** — OOF AUC, Brier score, drift indicator

The original **Gradio app** (`app.py`) remains available as a fallback for local demos.

## Deployment

```bash
# Ensure model artifact is present (Git LFS)
git lfs pull

# Local: build frontend + run API
cd huggingface_space/frontend && npm install && npm run build
cd .. && pip install -r requirements.txt && uvicorn api:app --host 0.0.0.0 --port 7860

# Hugging Face: push this folder to a Docker SDK Space (builds via Dockerfile)
```

Full project documentation lives in the repository root `README.md`.
