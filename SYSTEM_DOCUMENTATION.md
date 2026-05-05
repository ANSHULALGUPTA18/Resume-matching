# AI-Powered Resume Matching System
### Project Documentation — For Management Review

**Project Name:** AI Resume Matching & Scoring Engine  
**Date:** May 2026  
**Prepared By:** Development Team  

---

## 1. What Is This System?

This is an **AI-powered hiring assistant** that automatically reads job descriptions and resumes, then scores each candidate on how well they match the job — just like an experienced HR professional would, but in seconds and at any scale.
 
Instead of your HR team manually reading 100+ resumes for a single job posting (which takes days), this system reads every resume in minutes, scores each candidate from 0–100, and gives recruiters a sorted shortlist with clear reasons — so they only spend their time on the top candidates.

---

## 2. The Problem It Solves

### Before This System:
| Challenge | Impact |
|---|---|
| HR reads 100 resumes manually | 8–12 hours per job posting |
| Subjective screening | Different HR staff shortlist different people for the same job |
| Skills missed | A resume saying "JS" gets rejected even though the job needs "JavaScript" |
| No explainability | Recruiters can't explain why a candidate was shortlisted |
| Duplicate resumes | Same person applies twice, processed twice |

### After This System:
| Result | Impact |
|---|---|
| 100 resumes processed | Under 5 minutes |
| Consistent scoring | Every resume gets the same objective evaluation |
| Smart skill matching | "JS", "JavaScript", "ES6" all recognized as the same skill |
| Explainable scores | Clear breakdown: skill score, experience score, strengths, gaps |
| Duplicate detection | Same resume linked automatically, never double-processed |

---

## 3. How The System Works — Simple Explanation

Think of this system like a **panel of 5 expert reviewers** evaluating every resume, except these reviewers are AI and they never get tired, never have bias, and can work on 10 resumes simultaneously.

Here is what happens when a recruiter uploads resumes:

### Step 1 — The Recruiter Posts a Job
The recruiter uploads or pastes a Job Description. The system's **first AI expert (Agent 1)** immediately reads it and extracts key information:
- What skills are absolutely required?
- What level of experience is needed?
- What domain/industry does this role belong to?
- What would be a dealbreaker?

> **Real Example:** For a "Senior Java Engineer" job, Agent 1 extracts:
> Required: Java, Spring Boot, Microservices, AWS | Level: Senior | Experience: 4–6 years | Domain: Technology

---

### Step 2 — Resumes Are Uploaded in Bulk
The recruiter uploads 10, 50, or 100+ resumes at once (PDF or Word). The system puts them all in a processing queue and works through them — up to 10 at a time — without slowing down.

---

### Step 3 — Each Resume Goes Through 4 Matching Phases

#### Phase 1 & 2: Checklist Matching (Fast Screening)
Think of this like a **checklist on a form**. The system checks:
- Does the resume mention the required skills? (Java, Spring Boot, AWS...)
- How many years of experience do they have?
- What is their education level?

Each matched skill adds points. Missing a required skill loses points. This gives an initial keyword score.

> **Example:** A Java developer who has Java ✓, Spring Boot ✓, AWS ✓, but no Microservices ✗ → 75/100 at this phase.

#### Phase 3: Meaning-Based Matching (Smart Understanding)
This goes beyond keywords. The system uses an **AI language model** to understand the *meaning* of both the job description and the resume — not just the words.

> **Why this matters:** A job says "experience with cloud platforms." The resume says "deployed apps on AWS and Azure." The words don't match exactly, but the meaning does. Phase 3 catches this.
>
> **Analogy:** It's like the difference between a junior employee who reads a checklist vs. a senior HR professional who *understands* the context of what they're reading.

#### Phase 4: Deep AI Analysis (LLM Scoring)
For strong candidates (score above 40), the system calls a powerful **Large Language Model (LLM)** — the same kind of AI behind ChatGPT — to do a deeper analysis. This produces detailed feedback: key strengths, key gaps, and an overall recommendation.

---

### Step 4 — 5 AI Agents Work Together on Each Resume

After the 4 phases, 5 specialized AI agents run in parallel to refine the score:

| Agent | What It Does | Simple Analogy |
|---|---|---|
| **Agent 1: JD Decomposer** | Understands the job description deeply | A specialist who reads and summarises the job ad |
| **Agent 2: Resume Intelligence** | Understands the resume deeply — skill depth, career trajectory, red flags | A senior HR manager who reads between the lines of a resume |
| **Agent 3: Skills Validator** | Checks if a "missing" skill has a close equivalent the candidate already knows | Asks: "Does React experience count toward an Angular job?" |
| **Agent 4: Experience Matcher** | Compares the candidate's career level, domain, and years to the job requirements | A hiring manager who checks if the career story fits |
| **Agent 5: Score Synthesizer** | Combines all signals into one final score and verdict | The head of the hiring committee who makes the final call |

> **Real Example — Agent 3 in action:**  
> Job requires "Scala". Candidate has "Java" (same family of programming languages).  
> Agent 3 says: "Java is adjacent to Scala — 1–2 months ramp-up time, not a hard blocker."  
> Result: Score goes up instead of penalising for a missing skill that isn't truly missing.

---

### Step 5 — Results Are Ranked and Displayed

Recruiters see:
- All candidates sorted by match score (highest first)
- A score breakdown (skills, experience, seniority, domain)
- A "verdict" label: Strong Match / Good Fit / Partial Fit / Borderline / Not a Fit
- Top strengths of the candidate
- Key gaps to be aware of
- A recruiter note with actionable next steps

---

## 4. Technologies Used — What They Are and Why

### 4.1 Frontend (The Website Recruiters Use)
**Technology: React.js**  
**What it is:** The visual interface — the website a recruiter opens in their browser.  
**Why React:** It's the industry standard for building fast, responsive websites. It updates instantly without page reloads — so when a recruiter filters or sorts candidates, they see results immediately.  
**Example:** Like how Google search results appear instantly as you type — that's the same technology.

---

### 4.2 Backend API (The Brain)
**Technology: Node.js + Express**  
**What it is:** The server that handles all requests — when a recruiter uploads a file, or clicks "view candidates," this is what processes it.  
**Why Node.js:** It's extremely fast at handling many requests at the same time. It's used by Netflix, LinkedIn, and Uber for the same reason.  
**Example:** Like a call centre manager who routes every incoming call to the right person instantly.

---

### 4.3 Database (The Filing Cabinet)
**Technology: PostgreSQL**  
**What it is:** The permanent storage where all jobs, resumes, scores, and analysis results are saved.  
**Why PostgreSQL:** It's one of the most reliable, battle-tested databases in the world — used by Instagram, Spotify, and most major banks. It guarantees data is never lost.  
**Example:** Like a secure filing cabinet where every document is stored, indexed, and can be retrieved instantly.

---

### 4.4 Smart Cache (The Memory Shortcut)
**Technology: Redis**  
**What it is:** A super-fast temporary memory that stores recent results.  
**Why Redis:** If the same resume is uploaded again (in a new batch), the system recognises it instantly and skips reprocessing — saving time and cost.  
**Example:** Like a receptionist who remembers a visitor from last week and doesn't ask for their details again.

---

### 4.5 Background Job Queue (The Assembly Line)
**Technology: pg-boss (PostgreSQL Queue)**  
**What it is:** A queue system that manages the processing of many resumes in the background.  
**Why a queue:** When 100 resumes are uploaded, you can't process them all in 1 second. The queue lines them up, processes 10 at a time, retries any that fail, and tracks completion — without the recruiter waiting.  
**Example:** Like a production line at a factory — products come in, get processed in order, and the supervisor knows exactly what's done and what's pending.  
**No separate software required:** Unlike traditional queues (which need extra servers), this queue runs inside the existing database — simpler, cheaper, more reliable.

---

### 4.6 AI Language Models (The Expert Reviewers)
**Two providers used as backup for each other:**

**Groq API** — Primary AI provider  
- Model: `llama-3.3-70b-versatile` (70 billion parameter AI)  
- Speed: Extremely fast responses (under 2 seconds)  
- Cost: **Free** (12,000 token limit per minute per key)  
- We use: **5 API keys** rotating automatically — so if one hits a limit, the next one takes over instantly. Total effective capacity: 60,000 tokens/minute.

**Gemini API** (Google) — Backup AI provider  
- Model: `gemini-2.5-flash`  
- Cost: **Free** (Google's generous free tier)  
- We use: **5 API keys** as a second layer of fallback  
- If all 5 Groq keys are busy, the system automatically switches to Gemini — zero downtime.

> **Why two providers?**  
> **Analogy:** Like having two electricity suppliers. If the main one has an outage, the backup kicks in automatically. Recruiters never notice a disruption.

**Total AI capacity: 10 keys, 2 providers — designed for zero-downtime batch processing.**

---

### 4.7 Embedding Model (The Meaning Understander)
**Technology: all-MiniLM-L6-v2 (runs locally on our server)**  
**What it is:** A small, fast AI model that converts text into numbers (called "embeddings") that represent *meaning* — not just words.  
**Why local:** It runs on our own machine — no API call, no cost, no data sent externally.  
**Example:** Imagine converting every book into a GPS coordinate based on its topic. Books about "cooking Italian food" cluster near each other on the map, far from "software engineering." This model does the same for resumes and job descriptions — then measures how close they are.

---

### 4.8 Python Flask Servers (The Specialist Departments)
**Technology: Python + Flask**  
**What they are:** Two separate Python web servers that run alongside the main backend:
- **Embedding Server (port 5001):** Handles the AI meaning-matching and LLM scoring
- **Agent Server (port 5003):** Runs the 5 AI agents

**Why separate servers?** Each requires different libraries (Python AI libraries don't mix well with JavaScript). Separating them means:
- They can be scaled independently
- A crash in one doesn't affect the others
- Development is cleaner and faster

---

## 5. Score Breakdown — How the Final Score Is Calculated

Every candidate receives a score from **0 to 100** built from multiple signals:

```
FINAL SCORE = Skills (40%) + Experience (35%) + Seniority (15%) + Domain (10%)
```

| Component | Weight | What It Measures |
|---|---|---|
| Skills Match | 40% | Does the candidate have the required technical skills? (with transferable skill credit) |
| Experience Match | 35% | Do their years and career quality align with the role? |
| Seniority Alignment | 15% | Is their level (junior/senior) right for the job? |
| Domain Alignment | 10% | Have they worked in a related industry? |

**Penalty rules:**
- Missing a dealbreaker skill with no equivalent: up to −15 points
- Severely underqualified in experience (< 40% of requirement): −50% of total score
- Significantly below required education: −20% of total score

**Score → Verdict mapping:**
| Score | Verdict |
|---|---|
| 85–100 | Strong Match |
| 70–84 | Good Fit |
| 55–69 | Partial Fit |
| 40–54 | Borderline |
| 0–39 | Not a Fit |

---

## 6. Cost Summary

| Component | Cost |
|---|---|
| Groq API (5 keys) | **$0/month** — Free tier |
| Gemini API (5 keys) | **$0/month** — Free tier |
| Embedding Model | **$0/month** — Runs locally |
| PostgreSQL | **$0** — Open source |
| Redis | **$0** — Open source |
| Node.js / Python | **$0** — Open source |
| **Total AI/Infrastructure Cost** | **$0/month** |

The only cost is the server/computer that runs the system.

---

## 7. Security & Privacy

- Resumes are stored only in **our own database** (not sent to any cloud storage)
- Only the **text content** of resumes is sent to AI providers for scoring (no personal files uploaded externally)
- Duplicate detection uses a **hash fingerprint** — resumes are never compared by storing them twice
- API keys are stored in a secure `.env` file, not in the code

---

## 8. Complete Workflow — From Job Posting to Shortlist

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RECRUITER ACTIONS                                │
└─────────────────────────────────────────────────────────────────────────┘

  STEP 1: Post a Job
  ──────────────────
  Recruiter opens the website → uploads or pastes Job Description
  
       ↓ (instantly, in background)
  
  [Agent 1] Reads the JD → extracts required skills, seniority,
            experience, domain, dealbreakers
            Stores structured understanding in database


  STEP 2: Upload Resumes
  ──────────────────────
  Recruiter selects 1–100+ PDF/Word resumes → clicks Upload
  
       ↓ (all resumes enter the processing queue)
  
  System confirms upload immediately → processing starts in background
  Recruiter can close browser — results will be ready when they return


  STEP 3: Processing Queue (10 resumes at a time)
  ────────────────────────────────────────────────
  For EACH resume, the following happens:
  
  ┌─ CHECK: Already seen this resume? ──────────────────────────────────┐
  │  YES → Link to this batch instantly. Skip all processing. (Smart!)  │
  │  NO  → Continue to scoring pipeline below                           │
  └─────────────────────────────────────────────────────────────────────┘
  
  ┌─ PHASE 1 & 2: Keyword Scoring ──────────────────────────────────────┐
  │  • Parse resume text (extract skills, experience, education)         │
  │  • Match against job required/preferred skills                       │
  │  • Apply experience and education penalties if needed                │
  │  • Output: Keyword Score (0–100)                                     │
  └─────────────────────────────────────────────────────────────────────┘
  
       ↓ (if keyword score ≥ 40, continue to full AI pipeline)
  
  ┌─ PHASE 3: Semantic Matching ─────────────────────────────────────────┐
  │  • Convert resume sections (skills, experience, education,           │
  │    summary) into "meaning vectors"                                   │
  │  • Compare meaning vectors against the job description               │
  │  • Output: Semantic Match Score                                      │
  └──────────────────────────────────────────────────────────────────────┘
  
       ↓ (runs in parallel with Agent 2)
  
  ┌─ AGENT 2: Resume Intelligence ──────────────────────────────────────┐
  │  • AI reads full resume deeply                                       │
  │  • Identifies: actual skill depth, career trajectory, red flags,    │
  │    seniority signals, domain history                                 │
  │  • Output: Structured resume profile                                 │
  └─────────────────────────────────────────────────────────────────────┘
  
       ↓ (Agents 3 & 4 run in parallel, both need Agent 2's output)
  
  ┌─ AGENT 3: Skills Validator ──────────────────────────────────────────┐
  │  • For each "missing" required skill:                                │
  │    – Does the candidate have a transferable equivalent?              │
  │    – (e.g. Angular ≈ React, Docker ≈ Kubernetes basics)             │
  │  • Output: Adjusted skill score, confirmed gaps                      │
  └──────────────────────────────────────────────────────────────────────┘
  
  ┌─ AGENT 4: Experience Matcher ────────────────────────────────────────┐
  │  • Compares candidate's seniority level to job requirement           │
  │  • Checks domain alignment (fintech vs e-commerce vs healthcare)     │
  │  • Evaluates years of experience vs job minimum                      │
  │  • Output: Experience score, alignment summary                       │
  └──────────────────────────────────────────────────────────────────────┘
  
       ↓
  
  ┌─ AGENT 5: Score Synthesizer ─────────────────────────────────────────┐
  │  • Takes ALL signals: keyword + semantic + skill + experience        │
  │  • Applies weighting formula:                                        │
  │    Skills 40% + Experience 35% + Seniority 15% + Domain 10%        │
  │  • Applies penalties for dealbreaker gaps                            │
  │  • Produces final verdict: Strong Match / Good Fit / Partial / etc. │
  │  • Writes top strengths, key gaps, recruiter note                    │
  │  • Output: FINAL SCORE (0–100) + Detailed Analysis                  │
  └──────────────────────────────────────────────────────────────────────┘
  
       ↓
  
  Result saved to database + score cached for instant future reuse


  STEP 4: Recruiter Reviews Results
  ───────────────────────────────────
  Recruiter opens the job → sees all candidates sorted by score
  
  Each candidate card shows:
  ✦ Final Score (e.g. 87/100)
  ✦ Verdict (e.g. "Strong Match")
  ✦ Score breakdown (Skills: 88 | Experience: 90 | Seniority: 85 | Domain: 80)
  ✦ Top Strengths (e.g. "5 years fintech Java, led team of 4, quantified results")
  ✦ Key Gaps (e.g. "No Kubernetes experience — 2–3 months ramp-up needed")
  ✦ Recruiter Note (e.g. "Strong technical fit. Recommend technical interview.")


  STEP 5: Recruiter Takes Action
  ────────────────────────────────
  Recruiter uses the shortlist to:
  → Schedule interviews for top-scored candidates
  → Skip low-score candidates with confidence
  → Share ranked list with hiring manager
```

---

## 9. System Architecture Diagram

```
                    ┌─────────────────────┐
                    │   RECRUITER'S        │
                    │   BROWSER            │
                    │  (React Website)     │
                    └────────┬────────────┘
                             │ uploads JD + resumes
                             ▼
                    ┌─────────────────────┐
                    │   BACKEND API        │
                    │   (Node.js)          │◄─── stores all data
                    │   Port 5002          │
                    └─────┬──────┬────────┘
                          │      │
          sends to queue  │      │ generates embeddings
                          │      ▼
                          │  ┌───────────────────┐
                          │  │  EMBEDDING SERVER  │
                          │  │  (Python)          │
                          │  │  Port 5001         │
                          │  │  MiniLM AI Model   │
                          │  └───────────────────┘
                          │
                          ▼
             ┌────────────────────────┐
             │  PROCESSING QUEUE      │
             │  (pg-boss in           │
             │   PostgreSQL)          │
             └────────────┬───────────┘
                          │ 10 resumes at a time
                          ▼
             ┌────────────────────────┐
             │  BACKGROUND WORKER     │
             │  (Node.js)             │
             │                        │
             │  Phase 1+2: Keywords   │
             │  Phase 3:   Semantics  │──► EMBEDDING SERVER
             │  Agents 1–5: AI       │──► AGENT SERVER
             └────────────┬───────────┘
                          │
                          ▼
             ┌────────────────────────┐         ┌──────────────────┐
             │  AI AGENT SERVER       │────────► │  GROQ API        │
             │  (Python)              │          │  (AI Model)      │
             │  Port 5003             │          │  5 keys rotating │
             │                        │          └──────────────────┘
             │  Agent 1: JD Decompose │               │ fallback
             │  Agent 2: Resume Intel │               ▼
             │  Agent 3: Skills Valid │          ┌──────────────────┐
             │  Agent 4: Exp Match    │────────► │  GEMINI API      │
             │  Agent 5: Synthesize   │          │  (Google AI)     │
             └────────────┬───────────┘          │  5 keys rotating │
                          │                      └──────────────────┘
                          ▼
          ┌───────────────────────────────┐
          │  POSTGRESQL DATABASE          │
          │  (Permanent Storage)          │
          │  Jobs | Candidates | Batches  │
          │  Scores | Agent Analysis      │
          └───────────────────────────────┘
                          │
          ┌───────────────┘
          │
          ▼
          ┌───────────────────────────────┐
          │  REDIS CACHE                  │
          │  (Speed Layer)                │
          │  Same resume = instant result │
          └───────────────────────────────┘
```

---

## 10. What Makes This System Better Than Off-The-Shelf ATS

| Feature | Standard ATS | This System |
|---|---|---|
| Keyword matching | Basic word search | ✅ Smart aliases (JS = JavaScript = ES6) |
| Skill equivalents | No | ✅ Agent 3 identifies transferable skills |
| Experience analysis | Count years only | ✅ Career trajectory, seniority signals, quality |
| Explainability | Score only | ✅ Strengths, gaps, recruiter note per candidate |
| AI depth | Rule-based | ✅ 70B-parameter LLM + 384-dim semantic model |
| Cost | $200–$2000/month | ✅ **$0/month** (all free APIs + open source) |
| Duplicate detection | Manual | ✅ Automatic hash-based deduplication |
| Batch processing | Serial (slow) | ✅ 10 parallel, queue-backed, auto-retry on failure |
| Custom to your JDs | Generic scoring | ✅ Agent 1 learns your specific JD requirements |

---

## 11. Summary

This system is a **complete AI recruitment engine** built with production-grade technology at **zero monthly AI cost**. It replaces hours of manual resume screening with minutes of automated, explainable, consistent AI analysis.

The 5-agent pipeline ensures that scoring goes far beyond keyword matching — understanding the actual *depth* of a candidate's skills, the *quality* of their experience, and the *transferability* of their background — producing scores and verdicts that a recruiter can trust and act on immediately.

**Current capacity:** 48 candidates processed across 2 jobs, with 26 receiving full AI agent analysis. System is ready for production-scale batch uploads.

---

*Document generated by the development team. For technical questions, contact the developer.*
