# AEIP Run Guide

This project has 3 runnable parts:

1. Frontend (React + Vite) on port 3000
2. API service (FastAPI + MongoDB) on port 8001
3. Optional RAG service (FastAPI) on port 8000

Use this guide to run all components with the latest sprint, burndown, AI priority, and developer activity features.

## Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB running locally (default mongodb://localhost:27017)

Optional:

- Gemini API key for enhanced AI responses in frontend workflows

## Step 1: Install Frontend Dependencies

From project root:

```powershell
npm install
```

## Step 2: Configure Frontend Environment

Create .env.local in project root:

```env
VITE_API_BASE_URL=http://localhost:8001
VITE_GEMINI_API_KEY=your_key_here
```

Notes:

- VITE_API_BASE_URL is optional because 8001 is now the default in the client.
- Keep VITE_GEMINI_API_KEY if you are using Gemini-backed paths.

## Step 3: Install API Service Dependencies

From project root:

```powershell
cd api_service
pip install -r requirements.txt
```

## Step 4: Start API Service

From api_service folder:

```powershell
python main.py
```

Expected:

- Service starts on http://localhost:8001
- OpenAPI is available at http://localhost:8001/docs

Quick health check:

```powershell
Invoke-RestMethod http://localhost:8001/health
```

## Step 5: Optional RAG Service

If you want RAG endpoints too:

```powershell
cd ..\rag_service
pip install -r requirements.txt
python main.py
```

Expected:

- RAG service starts on http://localhost:8000

## Step 6: Start Frontend

Open another terminal at project root:

```powershell
npm run dev
```

Open browser:

- http://localhost:3000

## Smoke Test Flow (New Features)

After login, validate these in order:

1. Create a sprint in Sprint Management.
2. Create a task linked to that sprint.
3. Click Suggest Priority (AI) in task creation.
4. Open burndown chart and confirm data is rendered for selected sprint.
5. Open developer activity panel and confirm metrics appear.
6. Switch to board/list/gantt and confirm timeline alignment in gantt view.

## API Endpoints Added

- POST /api/sprints
- GET /api/sprints
- PUT /api/sprints/{sprint_id}
- GET /api/sprints/{sprint_id}/burndown
- POST /api/tasks/ai-priority
- GET /api/activity

## Troubleshooting

### Frontend cannot login or load data

- Confirm API service is running on 8001.
- Confirm VITE_API_BASE_URL (if set) points to 8001.
- Check browser network tab for failed requests.

### API fails to start

- Ensure MongoDB is running.
- Verify Python dependencies installed from api_service/requirements.txt.

### RAG unavailable warnings

- This is optional for core sprint/task features.
- Start rag_service only if you need RAG-specific behavior.

### Port already in use

- Stop old Python/Node processes occupying 3000, 8000, or 8001.

## Stop Services

Press Ctrl+C in each terminal window running:

- frontend
- api_service
- rag_service (if started)