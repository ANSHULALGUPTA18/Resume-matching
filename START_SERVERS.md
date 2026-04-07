# How to Start the ATS Resume Optimizer

## Prerequisites
- PostgreSQL installed and running on port 5432
- Python 3.11+ installed
- Node.js installed
- Docker Desktop installed (for Redis)

## One-Time Setup (first run only)

### Create the PostgreSQL database
```powershell
psql -U postgres -c "CREATE DATABASE ats_resume_optimizer;"
```
Or open **pgAdmin** and create a database named `ats_resume_optimizer`.

Tables are created **automatically** on first backend start — no extra SQL needed.

---

## Starting All Services

### 1. Start PostgreSQL (if not already running)
```powershell
net start postgresql-x64-18
```

### 2. Start Redis via Docker Desktop
Open **Docker Desktop** and start the Redis container.

Verify Redis is up:
```powershell
docker exec -it <redis-container-name> redis-cli ping
```
Should return `PONG`.

> Redis is used for score/embedding cache only. The job queue runs on PostgreSQL (pg-boss) — no Redis dependency for queue.

### 3. Start the Local Embedding Server (Terminal 1) — required for semantic scoring
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer"
python embedding_server.py
```
**Wait for**: `Model loaded successfully. Embedding dimension: 384`

> Without this, Phase 3 semantic scoring is skipped. The app still works with keyword scoring only.

### 4. Start the Backend Server (Terminal 2)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\backend"
npm run dev
```
**Wait for**: `PostgreSQL tables initialized`, `Server is running on port 5002`, and `Redis connected — score/embedding cache active`

### 5. Start the Async Worker (Terminal 3) — required for batch uploads
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\backend"
npm run worker
```
**Wait for**: `Worker started — concurrency: 10, queue: resume-processing (pg-boss/PostgreSQL)`

> This is a **separate process** from the backend. It pulls resume jobs from the pg-boss queue (PostgreSQL-backed) and processes them asynchronously. Without it, batch uploads will queue but never process.

### 6. Start the Frontend Server (Terminal 4)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\frontend"
npm start
```
**Wait for**: `Compiled successfully!` — browser opens at http://localhost:3000

---

## Service Ports
| Service | Port | Notes |
|---|---|---|
| PostgreSQL | 5432 | Database + pg-boss queue |
| Redis | 6379 | Score/embedding cache (Docker Desktop) |
| Embedding Server | 5001 | Python/Flask, all-MiniLM-L6-v2 (384-dim) |
| Backend API | 5002 | Node.js/Express |
| Worker | — | Background process, uses pg-boss/PostgreSQL |
| Frontend | 3000 | React |

---

## Scoring Pipeline (4 phases)
```
Resume Upload
  ↓
Phase 1+2: Keyword & skill scoring  (always runs)
  ↓  if overall score ≥ 65
Phase 3:   Section semantic scoring (requires embedding server)
  ↓  if overall score ≥ 65
Phase 4:   LLM scoring via Ollama   (requires Ollama + mistral:latest)
  ↓
Final blended score saved to PostgreSQL
Redis cache updated (hash → score) for instant dedup on re-upload
```

## Dedup / Cache Behaviour
- **Same resume + same JD**: hash matched → score loaded from Redis cache → result in ~100ms, no re-processing
- **New resume**: full 4-phase pipeline runs
- **Redis down**: graceful fallback to DB duplicate check (still no re-processing, just slower)

---

## Async Batch Upload Flow
```
Browser → POST /api/batch/upload → batchId returned in <1s
                                       ↓
                         pg-boss queue (PostgreSQL)
                                       ↓
                         Worker (npm run worker)
                     processes up to 10 resumes concurrently
                                       ↓
                     PostgreSQL: candidates saved/linked
                                       ↓
                 Browser receives live results via SSE
                     GET /api/batch/:id/progress
```

---

## Environment Configuration (`backend/.env`)
```
PORT=5002
DATABASE_URL=postgresql://postgres:Anshu@12345@localhost:5432/ats_resume_optimizer
NODE_ENV=development
MATCHING_MODE=vector
EMBEDDING_SERVER_URL=http://localhost:5001
REDIS_URL=redis://127.0.0.1:6379
```

---

## Troubleshooting

### Worker picks up jobs but SSE shows no candidates
Old worker process (without `--transpile-only`) is still running. Kill it:
```powershell
# Find all node.exe processes
Get-WmiObject Win32_Process -Filter 'Name="node.exe"' | Select-Object ProcessId, CommandLine

# Kill old worker by PID
Stop-Process -Id <PID> -Force
```

### Backend shows "Redis error — falling back to DB-only mode"
Redis container is not running. Open Docker Desktop and start the Redis container.

### Backend fails with "ECONNREFUSED :5432"
PostgreSQL is not running:
```powershell
net start postgresql-x64-18
```

### Backend fails with "password authentication failed"
Update `DATABASE_URL` in `backend/.env` with the correct password.

### Embedding Server shows dimension 1024 instead of 384
Wrong model loaded — check `embedding_server.py` is using `all-MiniLM-L6-v2`.

### Check if a port is in use
```powershell
netstat -ano | findstr "5002"
netstat -ano | findstr "5432"
```

### Kill a process on a port (Windows)
```powershell
# Find PID
netstat -ano | findstr "5002"
# Kill it
Stop-Process -Id <PID> -Force
```

> **Note**: Git Bash `kill -9 PID` does NOT kill Windows processes. Always use PowerShell `Stop-Process`.
