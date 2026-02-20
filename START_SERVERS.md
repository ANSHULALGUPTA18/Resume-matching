# How to Start the ATS Resume Optimizer

## Prerequisites
- MongoDB running on port 27017
- Python 3.11+ installed
- Node.js installed

## Starting All Services

### 1. Start MongoDB (if not already running)
```powershell
net start MongoDB
```

### 2. Start the Local Embedding Server (Terminal 1)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer"
python embedding_server.py
```
**Wait for**: "Model loaded successfully. Embedding dimension: 384"

### 3. Start the Backend Server (Terminal 2)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\backend"
npm run dev
```
**Wait for**: "MongoDB connected successfully" and "Server is running on port 5000"

### 4. Start the Frontend Server (Terminal 3)
```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer\frontend"
npm start
```
**Wait for**: "Compiled successfully!" and browser opens at http://localhost:3000

## Service Ports
- **MongoDB**: 27017
- **Embedding Server**: 5001 (Python/Flask)
- **Backend API**: 5000 (Node.js/Express)
- **Frontend**: 3000 (React)

## Local Embedding Model
- **Model**: all-MiniLM-L6-v2
- **Dimensions**: 384
- **Type**: 100% offline, no API costs
- **Speed**: Fast, runs on CPU

## Troubleshooting

### Embedding Server Won't Start
```powershell
pip install --upgrade -r requirements.txt
```

### Backend Can't Connect to Embedding Server
Check that embedding server is running:
```powershell
Test-NetConnection -ComputerName localhost -Port 5001
```

### Clear Old Data (if switching from OpenAI embeddings)
Old candidates won't have compatible embeddings. Upload new resumes after starting all servers.
