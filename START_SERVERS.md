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

### 2. Start the Local Embedding Server (Terminal 1) — optional, for vector matching
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer"
python embedding_server.py
```
**Wait for**: "Model loaded successfully. Embedding dimension: 1024"

> Skip this step if you only want keyword-based matching (the app works without it).

### 3. Start the Backend Server (Terminal 2)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\backend"
npm run dev
```
**Wait for**: "PostgreSQL tables initialized" and "Server is running on port 5000"

### 4. Start the Frontend Server (Terminal 3)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\frontend"
npm start
```
**Wait for**: "Compiled successfully!" and browser opens at http://localhost:3000

---

## Service Ports
- **PostgreSQL**: 5432
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
