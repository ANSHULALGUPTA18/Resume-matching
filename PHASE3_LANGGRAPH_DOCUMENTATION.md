# Phase 3 — LangGraph AI Agent Orchestration
### Technical Documentation For Management Review

**Phase:** 3 of 3  
**Date:** May 2026  
**Builds On:** Phase 1 (anti-hallucination fixes) + Phase 2 (LangChain structured output)

---

## 1. What Problem Does Phase 3 Solve?

### The Problem in Plain English

After Phase 1 and Phase 2, all five AI agents were working and producing accurate scores. But there was still a hidden architectural weakness: **the agents were called like five separate phone calls, with the TypeScript backend manually deciding when to call the next one.**

Imagine a hospital operating room where the surgeon has to personally call the anaesthetist, wait, then call the nurse, wait, then call the assistant — and if anyone doesn't answer, the surgeon has to improvise. That works, but it's fragile: the surgeon is managing logistics instead of focusing on the patient.

**That's exactly what the old code was doing:**
- The background worker made 4 separate HTTP calls to AI agents
- It manually checked "did Agent 2 succeed? If yes, call Agent 3 and 4. If not, skip."
- When an agent failed silently (e.g., rate limit with no error), the worker didn't know — it just moved on with missing data
- There was no guarantee that all agents ran in the right order
- Debugging a failure meant reading through 150+ lines of tangled if/else conditions

### What Phase 3 Adds

**LangGraph** is a framework that turns those manual if/else decisions into a proper **state machine** — a graph where:
- Every agent is a **node** (a box)
- Every transition is an **edge** (an arrow)
- Every routing decision is **explicit and visual** ("if Agent 2 fails → go to fallback")
- The **entire state flows safely** from start to finish

---

## 2. What Is LangGraph? (Plain English)

Think of LangGraph like a **airport terminal map**.

In the old system, a passenger (the resume data) would be told verbally: "Go to check-in. If check-in is open, go to security. If security is busy, try the fast lane. Then go to the gate." If any instruction was missed, the passenger wandered around confused.

With LangGraph, there is a **visual map on the wall**:
```
CHECK-IN ──(success)──▶ SECURITY ──(fast lane)──▶ GATE
    │                       │
(closed)                (backup)
    ▼                       ▼
REBOOKING DESK ──────▶ BUS TRANSFER
```

Everyone can see exactly where they should go. No confusion. No missed steps. If anything fails, there's a defined backup route. Someone can look at the map and immediately understand the whole process.

**That's exactly what Phase 3 does for our AI agents.**

---

## 3. The LangGraph Pipeline — How It Works

### The State Machine (The Map)

```
START
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENT 2 NODE                                                   │
│  Resume Intelligence                                            │
│  — Reads the resume, extracts skills and career signals        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
           ┌───────────▼─────────────┐
           │  CONDITIONAL ROUTER     │
           │  "Did Agent 2 succeed?" │
           └───────┬─────────┬───────┘
                   │YES      │NO
                   │         ▼
                   │   ┌──────────────────────────────────┐
                   │   │  HYBRID FALLBACK NODE            │
                   │   │  Uses keyword score as basis.    │
                   │   │  Safe, always returns a score.   │
                   │   └──────────────┬───────────────────┘
                   │                  │
                   ▼                  │
┌──────────────────────────────────┐  │
│  AGENT 3 NODE (Skills Validator) │  │
│  Checks transferable skills      │  │
└──────────────────┬───────────────┘  │
                   │ (sequential)     │
                   ▼                  │
┌──────────────────────────────────┐  │
│  AGENT 4 NODE (Exp. Matcher)     │  │
│  Evaluates career + domain fit   │  │
└──────────────────┬───────────────┘  │
                   │                  │
           ┌───────▼─────────────┐    │
           │  CONDITIONAL ROUTER │    │
           │  "Has real data?"   │    │
           └───────┬─────────────┘    │
                   │                  │
                   ▼                  │
┌──────────────────────────────────┐  │
│  AGENT 5 NODE (Synthesizer)      │  │
│  Rates 4 component scores only   │  │
│  (no math — next node does that) │  │
└──────────────────┬───────────────┘  │
                   │                  │
                   └─────────┬────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PYTHON MATH NODE                                               │
│  final_score = skills×0.40 + experience×0.35 +                │
│                seniority×0.15 + domain×0.10 − gap_penalty      │
│  100% deterministic Python — the LLM never touches this        │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  VALIDATOR NODE                                                 │
│  • Score must be 0–100                                          │
│  • Verdict must match score (Python assigns, not LLM)           │
│  • Strengths/gaps must be proper lists                          │
│  • Any mismatch is logged in validation_warnings               │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                                  END
                          (result returned to worker)
```

### What the State Carries

The "state" is like a **clipboard** that gets passed from node to node. Every node can read what's on the clipboard and add new information:

| What's on the Clipboard | Added By |
|---|---|
| Resume text, JD structure, keyword score | Set at start |
| Resume structured data (skills, career) | Agent 2 Node |
| Skill validation (transferable matches) | Agent 3 Node |
| Experience match (seniority, domain, years) | Agent 4 Node |
| Component scores (skills 80, exp 75, seniority 90, domain 40) | Agent 5 Node |
| **final_score** (e.g. 78.2) | **Python Math Node — never the LLM** |
| **verdict** (e.g. "Good Fit") | **Python Math Node — never the LLM** |
| validation_warnings | Validator Node |
| processing_path | Every node |

The critical point: **the LLM never computes the final score or assigns the verdict**. Those are pure Python math — always correct, never hallucinated.

---

## 4. Why Is This Better? Before vs After

### Before Phase 3 (Manual Orchestration)

```
TypeScript Worker:
  ↓
  Call Agent 2 via HTTP ─── wait ─── got null? Move on.
  ↓
  IF agent2 worked AND missing_skills > 0:
    Call Agent 3 via HTTP ─── wait ─── got null? Move on.
  ↓
  IF agent2 worked AND jdStructured exists:
    Call Agent 4 via HTTP ─── wait ─── got null? Move on.
  ↓
  IF (agent2 OR agent4) returned data AND keyword ≥ 40:
    Call Agent 5 via HTTP ─── wait ─── got null? Use hybrid fallback.
  ↓
  150 lines of if/else to decide the final score
```

**Problems:**
- 4 separate HTTP calls (each can fail independently, each adds latency)
- If Agent 2 silently returned an empty response, Agents 3 and 4 would use stale defaults
- When something went wrong, finding the root cause required reading through hundreds of lines
- Adding a new agent meant modifying the worker in multiple places

### After Phase 3 (LangGraph State Machine)

```
TypeScript Worker:
  ↓
  Call /agent/graph-pipeline (ONE HTTP call) ─── wait ─── got result.
  ↓
  Use result.final_score, result.verdict, result.score_breakdown
  ↓
  30 lines of clean code
```

**Benefits:**
- **1 HTTP call** instead of 4 — simpler, faster, less failure surface
- **Conditional routing is explicit** — the graph definition IS the documentation
- **State propagates safely** — each node knows exactly what data it received
- **The validator node** catches any inconsistencies before the score reaches the recruiter
- **processing_path** tells you exactly which route was taken ("full_graph" or "hybrid_fallback")
- **failed_agents** tells you exactly which agents had issues
- **Adding a new agent** = add one node and two edges to the graph — nothing else changes

---

## 5. Specific Improvements Phase 3 Adds

### 5.1 The processing_path Field

Every result now includes a `processing_path` label. Recruiters and developers can immediately see which route the system took for each candidate:

| processing_path | What Happened |
|---|---|
| `full_graph` | All agents ran successfully — most reliable score |
| `hybrid_fallback` | Agent 2 failed (server busy/rate limit) — score based on keywords only |

**Business value:** When a score seems unusual, you can check the path and immediately know whether to trust it fully or treat it as an estimate.

### 5.2 The validation_warnings Field

The Validator Node checks the output before returning it. If it finds anything inconsistent, it logs it:

- "Score 105 clamped to 100" (would have been impossible before — now caught)
- "Verdict corrected: 'Partial Fit' → 'Good Fit'" (Python always re-confirms)

**Business value:** The system self-audits. Every score that reaches the recruiter has passed a consistency check.

### 5.3 Defined Fallback Path

If Agent 2 (Resume Intelligence) fails, the graph immediately routes to the Hybrid Fallback Node. The fallback uses the keyword score and produces a safe, consistent output. The recruiter still sees a score — just with less AI depth.

**Business value:** The system always produces a result. There are no "null" scores or missing candidates.

### 5.4 Worker Code Cut From 150 Lines to 30

The TypeScript worker's `runHybridPipeline` function went from 150 lines of complex conditional logic to ~30 lines. This means:
- Fewer bugs possible
- Easier for any developer to understand and maintain
- Changes to agent logic only touch `agent_server.py`, not the worker

---

## 6. Test Results — Phase 3 Validated

All three phases tested together:

| Test | Score | Verdict | Path | Formula Check |
|---|---|---|---|---|
| Senior Java engineer → Java job | **91.0** | Strong Match | `full_graph` | base=91.0, gap=0.0 ✓ |
| PHP developer → Java job (wrong language) | **45.5** | Borderline | `full_graph` | base=50.5, gap=5.0 (Java penalty) ✓ |
| No agent data (keyword=5) | **31.0** | Not a Fit | `hybrid_fallback` | base=31.0, gap=0.0 ✓ |

**Differentiation gap: 91 − 45.5 = 45.5 points** — the system clearly distinguishes a qualified Java engineer from someone missing the core skill.

**Formula always matches**: The `score_breakdown` components always correctly produce the `final_score` when you apply the formula (within gap_penalty tolerance). No hallucinated numbers.

---

## 7. What Changed in the Codebase

| File | Change |
|---|---|
| `agent_server.py` | Added 7-node LangGraph graph: `PipelineState` TypedDict, all node functions, conditional edges, validator node, `/agent/graph-pipeline` endpoint |
| `backend/src/services/agentService.ts` | Added `runGraphPipeline()` method + `GraphPipelineResult` interface |
| `backend/src/workers/resumeWorker.ts` | Simplified `runHybridPipeline()`: 4 agent calls → 1 graph pipeline call; Phase 3 embeddings still run in parallel |

---

## 8. Complete 3-Phase Summary (All Improvements Together)

| Phase | What Was Fixed | Method |
|---|---|---|
| **Phase 1** | Math hallucination (LLM gave everyone 73) | Python computes `final_score` and assigns `verdict` |
| **Phase 1** | Agent 5 running blind (no real data) | Gate: only call Agent 5 when Agents 2/4 succeeded |
| **Phase 1** | Agent 2 inventing skills | Grounding instruction + word-level text filter |
| **Phase 2** | Out-of-range score values | Pydantic models with `Field(ge=0, le=100)` |
| **Phase 2** | Silent 429 rate limit failures | LangChain `with_fallbacks()` fallback chain (10 clients) |
| **Phase 2** | LLM not following component scoring patterns | Few-shot examples in Agent 5 system prompt |
| **Phase 3** | 4 separate agent calls with manual if/else | LangGraph StateGraph — one call, explicit routing |
| **Phase 3** | No visibility into which path was taken | `processing_path` + `failed_agents` in every result |
| **Phase 3** | No post-processing consistency check | Validator node enforces score bounds + verdict mapping |
| **Phase 3** | 150-line complex worker function | Simplified to 30-line clean integration |

---

## 9. How the Business Benefits

### For the Hiring Team

| Before | After All 3 Phases |
|---|---|
| PHP dev scored 73 "Good Fit" for a Java job | PHP dev scores 45 "Borderline" — correctly flagged |
| Same score (73) for different types of candidates | 91 vs 45 — 46-point spread between strong and weak match |
| Score didn't explain which AI path was taken | `processing_path: full_graph` shows full AI was used |
| No way to know if AI failed silently | `failed_agents: []` confirms all agents ran |
| Recruiter note sometimes mentioned internal metrics | Recruiter note is always human-readable, actionable |

### For the Development Team

| Before | After |
|---|---|
| 4 HTTP calls per resume in the worker | 1 HTTP call per resume (the graph) |
| 150 lines of conditional routing | 30 lines + the graph definition |
| "Something failed" — hard to know which step | `failed_agents` tells exactly which agent had issues |
| Adding a new agent required changes everywhere | Add one node + two edges to the graph only |
| No consistency validation on outputs | Validator node catches issues before they reach recruiters |

---

## 10. Architecture Diagram — All 3 Phases Together

```
RECRUITER uploads JD + resumes
          │
          ▼
    ┌─────────────────────────────────┐
    │   BACKEND API (Node.js :5002)   │
    │   Stores JD + starts batch      │
    └───────────┬─────────────────────┘
                │  JD uploaded → fires Agent 1 (non-blocking)
                ▼
    ┌─────────────────────────────────┐
    │  AGENT SERVER (Python :5003)    │
    │  Agent 1: JD Decomposer         │← reads JD, stores structured requirements
    └─────────────────────────────────┘

    ┌─────────────────────────────────┐
    │  BACKGROUND WORKER (pg-boss)    │
    │  Processes 10 resumes at once   │
    └───────────┬─────────────────────┘
                │
     For each resume:
         │
         ├── Phase 1+2: Keyword scoring  (TypeScript, instant)
         │
         ├── Phase 3 embeddings ──┐      (parallel)
         │   (embedding_server)   │
         │                        │
         └── LangGraph Pipeline ──┘
             (ONE call to :5003)
              │
              │  State machine runs:
              │  Agent 2 → Agent 3 → Agent 4 → Agent 5
              │  → Python Math → Validator
              │  (with conditional fallback routes)
              │
              ▼
         Final score, verdict, breakdown
         Agent insights (strengths, gaps, recruiter note)
         processing_path, failed_agents, validation_warnings
              │
              ▼
    ┌─────────────────────────────────┐
    │  POSTGRESQL DATABASE            │
    │  Stores everything permanently  │
    └─────────────────────────────────┘
              │
    ┌─────────────────────────────────┐
    │  REDIS CACHE                    │
    │  Same resume = instant result   │
    │  (no re-processing needed)      │
    └─────────────────────────────────┘
              │
              ▼
    ┌─────────────────────────────────┐
    │  FRONTEND (React :3000)         │
    │  Recruiter sees ranked list     │
    │  with scores, verdicts,         │
    │  strengths, gaps, notes         │
    └─────────────────────────────────┘
```

---

## 11. Cost Remains Zero

All Phase 3 additions use:
- **LangGraph**: Open-source, $0
- **langgraph Python package**: Open-source, $0
- **No new API keys required**: Uses the same 5 Groq + 5 Gemini keys from Phase 1
- **No new servers**: Runs inside the existing agent_server.py

**Total additional monthly cost: $0**

---

*Phase 3 documentation prepared by the development team. May 2026.*
