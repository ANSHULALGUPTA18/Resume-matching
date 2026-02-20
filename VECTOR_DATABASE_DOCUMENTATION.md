# Vector Database & Semantic Search — Full Documentation
## ATS Resume Optimizer

---

## 1. Overview

This system does **not use a standalone vector database** (like Pinecone, Weaviate, Chroma, or Qdrant).
Instead, it uses a **custom vector search stack** built from three components:

| Layer | Technology | Role |
|-------|-----------|------|
| **Embedding Model** | BAAI/bge-large-en-v1.5 (Python) | Converts text → 1024-dim float vectors |
| **Vector Storage** | MongoDB (existing DB) | Stores vectors as `Number[]` fields |
| **Similarity Engine** | Node.js in-memory computation | Cosine similarity at query time |

This is sometimes called an **"embedded vector search"** pattern — vectors live inside the same database as your other data, with similarity computed in application code rather than a dedicated vector index.

---

## 2. Embedding Model

### Model: BAAI/bge-large-en-v1.5

| Property | Value |
|----------|-------|
| **Full Name** | Beijing Academy of AI — BGE Large English v1.5 |
| **Dimensions** | 1024 |
| **Model Size on Disk** | ~1.34 GB |
| **RAM Required** | ~4 GB |
| **MTEB Benchmark Rank** | #5 (as of 2024) |
| **License** | Apache 2.0 (free, commercial use allowed) |
| **Runs On** | CPU (works) or GPU (faster) |
| **Internet Required** | No — 100% offline after first download |
| **Cost** | $0 — no API calls, no OpenAI/Cohere charges |

### Why BGE-large?
BGE (Beijing General Embedding) models are purpose-built for **retrieval and matching tasks**. They use an asymmetric search pattern that treats:
- **Search queries** (job descriptions) differently from
- **Documents** (resumes)

This is more accurate than symmetric models that treat both sides the same way.

---

## 3. Asymmetric Search Pattern

BGE-large requires special prefixes depending on what you're embedding:

```
Job Description  →  "query: <job text>"    →  Query embedding
Resume           →  "passage: <resume text>"  →  Passage embedding
```

The model was trained with this distinction. Using the wrong prefix (or no prefix) degrades accuracy significantly.

### How it's implemented in this project:

**Job upload** (`jobRoutes.ts`):
```typescript
job.embedding = await vectorService.generateEmbedding(embeddingText, 'query');
```

**Resume upload** (`candidateRoutes.ts`):
```typescript
const embedding = await vectorService.generateEmbedding(text, 'passage');
```

**Embedding server** (`embedding_server.py`):
```python
if text_type == 'query':
    prefixed_text = f"query: {text}"
else:
    prefixed_text = f"passage: {text}"
embedding = model.encode(prefixed_text, normalize_embeddings=True)
```

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│   User uploads JD / Resume → API call to localhost:5000     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend (Node.js / Express)                  │
│                       Port 5000                              │
│                                                              │
│  1. Parse text from PDF/DOCX/TXT                            │
│  2. POST to embedding server → get float[] vector           │
│  3. Save document + vector to MongoDB                        │
│  4. At query time: load both vectors, compute similarity     │
└───────────────┬─────────────────────┬────────────────────────┘
                │                     │
                ▼                     ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│  Embedding Server    │  │           MongoDB                │
│  (Python/Flask)      │  │         Port 27017               │
│  Port 5001           │  │                                  │
│                      │  │  jobs collection                 │
│  Model:              │  │  ├── title, company, text...     │
│  BAAI/bge-large      │  │  └── embedding: [f1,f2,...f1024] │
│  v1.5                │  │                                  │
│  1024 dimensions     │  │  candidates collection           │
│                      │  │  ├── name, skills, score...      │
│  Routes:             │  │  ├── embedding: [f1,f2,...f1024] │
│  POST /embed         │  │  └── semanticScore: 73           │
│  POST /batch-embed   │  │                                  │
│  GET  /health        │  └──────────────────────────────────┘
└──────────────────────┘
```

---

## 5. Vector Storage in MongoDB

### Job Document Schema
```typescript
// models/Job.ts
{
  title: String,
  company: String,
  description: String,
  requirements: { skills, experience, education, certifications },
  keywords: [String],
  rawText: String,
  fileName: String,
  embedding: { type: [Number], select: false }  // 1024-dim vector, hidden by default
}
```

### Candidate Document Schema
```typescript
// models/Candidate.ts
{
  jobId: ObjectId,
  personalInfo: { name, email, phone, location },
  skills: [String],
  score: { overall, skillMatch, experienceMatch, educationMatch, keywordMatch },
  improvements: [String],
  status: 'new' | 'shortlisted' | 'hold' | 'rejected',
  embedding: { type: [Number], select: false },  // 1024-dim vector
  semanticScore: Number                          // cosine similarity × 100
}
```

### Important: `select: false`
The `embedding` field is marked `select: false` in both schemas. This means:
- **Normal queries** (`Job.find()`, `Job.findById()`) do NOT return the embedding — keeps API responses small
- **Explicit select** (`Job.findById(id).select('+embedding')`) required to fetch it for similarity computation
- The 1024 floats per document (~8 KB) are never sent to the browser unnecessarily

---

## 6. Similarity Computation

### Algorithm: Cosine Similarity

```typescript
// vectorService.ts
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function scoreFromEmbeddings(jobEmb: number[], candidateEmb: number[]): number {
  const similarity = cosineSimilarity(jobEmb, candidateEmb);
  return Math.min(100, Math.max(0, Math.round(similarity * 100)));
}
```

### Why Cosine Similarity?
- Measures the **angle** between two vectors (not their magnitude)
- Normalized embeddings from BGE-large always have magnitude ~1.0, so dot product ≈ cosine
- Output range: -1.0 to 1.0 → converted to 0–100 score for the UI
- **Semantic match**, not keyword overlap — two texts can use completely different words and still score high if they mean the same thing

### Similarity Score Examples (from live test)
| Comparison | Semantic Score |
|-----------|---------------|
| Data Scientist resume vs. Data Scientist JD | **73.7%** |
| Marketing Manager resume vs. Data Scientist JD | **56.1%** |
| Frontend Dev resume vs. Frontend Dev JD | **~70-80%** (typical) |

---

## 7. Scoring Pipeline — Full Flow

When a user clicks **"Check Fit"**, the following happens for each resume:

```
Step 1: Parse resume file (PDF/DOCX/TXT)
        └─> Extract raw text

Step 2: Keyword-based scoring (always runs)
        ├─> Skill match:      (matched skills / required skills) × 100      weight: 40%
        ├─> Experience match: (candidate years / required years) × 100       weight: 30%
        ├─> Education match:  (degree level check) × 100                    weight: 15%
        └─> Keyword match:    (JD keywords found in resume) × 100           weight: 15%
        → score.overall = weighted average

Step 3: Generate resume embedding (if embedding server is running)
        └─> POST /embed {"text": resumeText, "type": "passage"}
            → 1024-dim float vector

Step 4: Load job embedding from MongoDB
        └─> Job.findById(jobId).select('+embedding')

Step 5: Dimension safety check
        └─> if job.embedding.length === candidate.embedding.length → proceed
            else → skip (log warning, keep keyword score)

Step 6: Semantic scoring (if MATCHING_MODE=vector)
        └─> semanticScore = cosineSimilarity(jobEmb, resumeEmb) × 100
            score.overall = semanticScore  ← OVERWRITES keyword score

Step 7: Save candidate to MongoDB with both scores
```

### Scoring Modes

| `MATCHING_MODE` | Behavior |
|----------------|----------|
| `vector` (current setting) | Semantic score replaces keyword overall score |
| `keyword` | Only keyword scoring used, embedding stored but ignored |
| Embedding server down | Graceful fallback to keyword-only, no crash |

---

## 8. Embedding Server API

The Flask server at `http://localhost:5001` exposes three endpoints:

### `GET /health`
```json
{
  "status": "healthy",
  "model": "BAAI/bge-large-en-v1.5",
  "dimension": 1024
}
```

### `POST /embed`
Embed a single text.

**Request:**
```json
{
  "text": "Senior Python Engineer with Django, AWS, 5 years experience",
  "type": "query"
}
```

**Response:**
```json
{
  "embedding": [0.0256, -0.0014, -0.0492, ...],  // 1024 floats
  "dimension": 1024,
  "model": "BAAI/bge-large-en-v1.5",
  "type": "query"
}
```

**Rules:**
- `type`: `"query"` for job descriptions, `"passage"` for resumes
- `text`: truncated to 10,000 characters automatically
- Timeout: 30 seconds (set in `vectorService.ts`)

### `POST /batch-embed`
Embed multiple texts in a single call.

**Request:**
```json
{
  "texts": ["resume text 1", "resume text 2", "resume text 3"],
  "type": "passage"
}
```

**Response:**
```json
{
  "embeddings": [[...1024 floats...], [...], [...]],
  "count": 3,
  "dimension": 1024,
  "model": "BAAI/bge-large-en-v1.5",
  "type": "passage"
}
```

---

## 9. Python Dependencies

```
flask==3.0.0               # Web server for embedding API
flask-cors==4.0.0          # Allow cross-origin requests from Node.js
sentence-transformers==2.7.0  # Loads and runs BGE model
torch==2.3.0               # PyTorch backend for model inference
transformers==4.41.0       # HuggingFace model loading
numpy==1.26.4              # Array operations
pymongo==4.6.1             # MongoDB access for migration script
```

---

## 10. Configuration

### Backend `.env`
```env
MATCHING_MODE=vector          # 'vector' = semantic scoring, 'keyword' = keyword only
EMBEDDING_SERVER_URL=http://localhost:5001
MONGODB_URI=mongodb://localhost:27017/ats_resume_optimizer
```

### Frontend `.env`
```env
REACT_APP_API_URL=http://localhost:5000/api
```

---

## 11. Safety & Fallback Features

| Scenario | Behavior |
|----------|----------|
| Embedding server is DOWN | Keyword scoring used, upload still succeeds |
| Dimension mismatch (384-d vs 1024-d) | Warning logged, semantic step skipped |
| Empty embedding `[]` | Vector comparison skipped (length = 0 = falsy) |
| Cosine zero-magnitude vector | Returns 0, no division by zero |
| Text longer than 10,000 chars | Auto-truncated before embedding |
| Request timeout (>30s) | Error caught, falls back to keyword score |

---

## 12. Performance Characteristics

| Operation | Time (CPU) |
|-----------|-----------|
| Model load at startup | 5–15 seconds |
| Single text embedding | 200–400 ms |
| Cosine similarity (1024-d) | < 1 ms |
| Full resume upload + score | 400–600 ms |
| Batch of 10 resumes | 4–6 seconds |

---

## 13. Comparison: This Approach vs. Dedicated Vector DBs

| Feature | This Project (MongoDB + custom) | Pinecone / Weaviate / Qdrant |
|---------|--------------------------------|------------------------------|
| Setup complexity | Low — reuses existing MongoDB | High — separate service |
| ANN (approximate nearest neighbor) | No — brute-force cosine | Yes — HNSW index |
| Scale | Good up to ~10,000 vectors | Millions/billions |
| Cost | $0 | $0–$hundreds/month |
| Filtering | Native MongoDB queries | Metadata filtering |
| Persistence | MongoDB (standard) | Dedicated vector store |
| Best for | Small-medium ATS systems | Large-scale production search |

For an ATS tool comparing resumes against a specific job (not searching millions of vectors), brute-force cosine is perfectly suitable and avoids the overhead of a dedicated vector database.

---

## 14. Migration Script

If you switch embedding models (e.g., from the old 384-dim to the current 1024-dim), old embeddings become incompatible. Run:

```powershell
cd "C:\Users\AnshuLal Gupta\Desktop\resume optimizer\ATS-Resume-Optimizer"
python clear_old_embeddings.py
```

This uses `$unset` in MongoDB to remove `embedding` and `semanticScore` from all documents. After running, re-upload your data to generate fresh 1024-dim embeddings.

---

## 15. Starting the Embedding Server

```powershell
# From the ATS-Resume-Optimizer directory
.\.venv\Scripts\python.exe embedding_server.py
```

Wait for the output:
```
Model loaded successfully. Embedding dimension: 1024
Starting BGE-Large Embedding Server on http://localhost:5001
```

The server must be running before the backend starts accepting uploads, or uploads will fall back to keyword-only scoring.

---

## 16. Model Evolution History

| Version | Model | Dimensions | Trigger |
|---------|-------|-----------|---------|
| v1 | OpenAI `text-embedding-ada-002` | 1536 | Original (API cost) |
| v2 | `all-MiniLM-L6-v2` | 384 | Switch to local/offline |
| v3 (current) | `BAAI/bge-large-en-v1.5` | 1024 | Better quality, MTEB #5 |

---

*Document generated: February 2026*
*Project: ATS Resume Optimizer*
