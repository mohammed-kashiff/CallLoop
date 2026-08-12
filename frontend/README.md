# CALL LOOP (CallProof UI)

Vite + React + TypeScript frontend integrated with the CallProof FastAPI backend.

## Run

Terminal 1 — API (repo root):

```bash
.venv/bin/uvicorn api:app --reload --port 8000
```

Terminal 2 — UI:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Optional: `VITE_API_BASE=http://127.0.0.1:8000` if the API is not on localhost:8000.

## What talks to the backend

- Upload MP3 → `POST /api/upload` (transcribe)
- Audit → `GET /api/calls/{id}/audit`
- Coaching → `POST /api/calls/{id}/coaching`
- Audio → `GET /api/calls/{id}/audio`

Sample audit button stays offline (demo data only).
