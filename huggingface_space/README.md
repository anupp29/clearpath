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

- Loads a single pre-trained artifact (`model/clearpath_model.pkl`) — no training happens in this Space.
- Scores any new ASTraM-style event for closure probability, expected duration, impact index,
  and recommended officer-deployment tier, in well under 100ms.
- Ships with a live hotspot map, the historical dispatch plan, and full SHAP / temporal-CV
  model-insight panels for judges and reviewers.

Full project documentation, architecture diagrams, EDA, and the leakage-audit narrative live in
the repository root `README.md` (one level above this folder), not in this Space card.
