# How to Start the ATS Resume Optimizer

## Prerequisites
- PostgreSQL 18 installed and running on port 5432
- Python 3.11+ installed
- Node.js installed

## One-Time Setup (first run only)

### Create the PostgreSQL database
```powershell
psql -U postgres -c "CREATE DATABASE ats_resume_optimizer;"
```
Or open **pgAdmin** and create a database named `ats_resume_optimizer`.

The tables (`jobs`, `candidates`) are created **automatically** on first backend start — no extra SQL needed.

---

## Starting All Services

### 1. Start PostgreSQL (if not already running)
```powershell
net start postgresql-x64-18
```

### 2. Start Redis (Terminal — WSL)
```powershell
wsl redis-server /etc/redis/redis.conf --daemonize yes
```
**Wait for**: no output (daemonized). Verify with `wsl redis-cli ping` → should return `PONG`.

> **One-time setup required**: WSL2 needs mirrored networking so Windows Node.js can reach WSL Redis.
> Create `C:\Users\AnshuLal Gupta\.wslconfig` with:
> ```
> [wsl2]
> networkingMode=mirrored
> ```
> Then run `wsl --shutdown` once. After that, `wsl redis-server --daemonize yes` is all you need.

### 3. Start the Local Embedding Server (Terminal 1) — optional, for vector matching
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer"
python embedding_server.py
```
**Wait for**: "Model loaded successfully. Embedding dimension: 1024"

> Skip this step if you only want keyword-based matching (the app works without it).

### 4. Start the Backend Server (Terminal 2)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\backend"
npm run dev
```
**Wait for**: "PostgreSQL tables initialized", "Server is running on port 5000", and **"Redis connected — score/embedding cache active"**

### 5. Start the Frontend Server (Terminal 3)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\frontend"
npm start
```
**Wait for**: "Compiled successfully!" and browser opens at http://localhost:3000

---

## Service Ports
- **PostgreSQL**: 5432
- **Redis**: 6379 (WSL)
- **Embedding Server**: 5001 (Python/Flask) — optional
- **Backend API**: 5000 (Node.js/Express)
- **Frontend**: 3000 (React)

---

## Environment Configuration (`backend/.env`)
```
PORT=5000
DATABASE_URL=postgresql://postgres:Anshu@12345@localhost:5432/ats_resume_optimizer
NODE_ENV=development
MATCHING_MODE=vector
EMBEDDING_SERVER_URL=http://localhost:5001
GROQ_API_KEY=gsk_...
REDIS_URL=redis://127.0.0.1:6379
```

---

## Matching Modes
| Mode | How it works | Requires embedding server? |
|---|---|---|
| `keyword` | Skill + keyword overlap scoring | No |
| `vector` | Semantic similarity via BGE-large embeddings | Yes |

Set `MATCHING_MODE=keyword` in `.env` to disable vector matching.

---

## Troubleshooting

### Backend shows "Redis error — falling back to DB-only mode"
Redis is not running. Start it: `wsl redis-server --daemonize yes`
If that doesn't help, verify mirrored networking is enabled in `~/.wslconfig` (see Step 2 above).

### Backend fails with "ECONNREFUSED :5432"
PostgreSQL is not running. Start it:
```powershell
net start postgresql-x64-18
```

### Backend fails with "password authentication failed"
Update `DATABASE_URL` in `backend/.env` with the correct password.

### Embedding Server Won't Start
```powershell
pip install --upgrade -r requirements.txt
```

### Check if a port is in use
```powershell
netstat -an | findstr "5000"
netstat -an | findstr "5432"
```

### Kill a process on a port
```powershell
# Find PID
netstat -ano | findstr "5000"
# Kill it
taskkill /PID <pid> /F
```
