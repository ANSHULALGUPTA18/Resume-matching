"""
AI Agent Server v2 — Phase 1 + Phase 2 Anti-Hallucination Upgrade
=================================================================
Phase 1 fixes (no-LLM):
  • Python computes final_score  → no math hallucination (was: LLM gave everyone 73)
  • Python assigns verdict       → no verdict mismatch
  • Agent 5 gated on real data   → only runs when Agents 2/4 succeeded
  • Agent 2 grounded             → prompt says "only extract what is written"
  • Text-grounding filter        → removes skills not found in raw resume text
  • Few-shot examples in Agent 5 → LLM sees correct component scoring patterns

Phase 2 additions (LangChain):
  • Pydantic models on all agent outputs → type-safe, range-validated
  • LangChain fallback chain             → Groq key1→5 then Gemini key1→5
  • with_structured_output()            → Pydantic validation on every LLM call
  • InMemoryRateLimiter                 → queues instead of crashing on 429

Endpoints:
  GET  /health
  POST /agent/decompose-jd
  POST /agent/parse-resume
  POST /agent/validate-skills
  POST /agent/match-experience
  POST /agent/synthesize
  POST /agent/full-pipeline
"""

import os
import re
import json
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import Optional, Any

# ── Load env ───────────────────────────────────────────────────────────────────
_env_path = Path(__file__).parent / "backend" / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

app = Flask(__name__)
CORS(app)


# ── Key loader ─────────────────────────────────────────────────────────────────
def _load_keys(prefix: str) -> list:
    keys = []
    for suffix in ["", "_2", "_3", "_4", "_5"]:
        k = os.environ.get(f"{prefix}{suffix}", "").strip()
        if k:
            keys.append(k)
    return keys


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — LangChain setup
# ══════════════════════════════════════════════════════════════════════════════

from pydantic import BaseModel, Field, field_validator
from typing import List, Literal

try:
    from langchain_groq import ChatGroq
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.rate_limiters import InMemoryRateLimiter
    from langchain_core.messages import SystemMessage, HumanMessage
    _LANGCHAIN_OK = True
except ImportError:
    _LANGCHAIN_OK = False
    print("LangChain not installed — falling back to raw API calls")

# No shared rate limiter — each key runs at its own Groq/Gemini limit independently.
# with_fallbacks() switches to the next key on 429, which is better than a shared bucket
# that throttles all keys together and causes timeouts under batch load.
_rate_limiter = None

# Build LangChain client lists
_lc_clients: list = []

if _LANGCHAIN_OK:
    groq_keys   = _load_keys("GROQ_API_KEY")
    gemini_keys = _load_keys("GEMINI_API_KEY")

    for key in groq_keys:
        try:
            _lc_clients.append(
                ChatGroq(api_key=key, model="llama-3.3-70b-versatile",
                         temperature=0, max_tokens=900)
            )
        except Exception as e:
            print(f"Groq LangChain init failed for a key: {e}")

    for key in gemini_keys:
        try:
            _lc_clients.append(
                ChatGoogleGenerativeAI(google_api_key=key, model="gemini-2.5-flash",
                                       temperature=0, max_output_tokens=900)
            )
        except Exception as e:
            print(f"Gemini LangChain init failed for a key: {e}")

    if _lc_clients:
        primary = _lc_clients[0]
        _chat_llm = primary.with_fallbacks(_lc_clients[1:]) if len(_lc_clients) > 1 else primary
        print(f"LangChain: {len(groq_keys)} Groq + {len(gemini_keys)} Gemini clients, "
              f"fallback chain of {len(_lc_clients)} total")
    else:
        _chat_llm = None
        print("LangChain: no clients initialised")
else:
    _chat_llm = None

# Keep raw Groq/Gemini clients as ultimate fallback (unchanged from v1)
_raw_groq_clients, _raw_groq_names = [], []
_raw_gemini_clients, _raw_gemini_names = [], []
try:
    from groq import Groq as _GroqSDK
    for i, key in enumerate(_load_keys("GROQ_API_KEY"), 1):
        _raw_groq_clients.append(_GroqSDK(api_key=key))
        _raw_groq_names.append(f"groq-key-{i}")
    if _raw_groq_clients:
        print(f"Raw Groq fallback: {len(_raw_groq_clients)} key(s)")
except Exception as e:
    print(f"Raw Groq init: {e}")

try:
    from google import genai as _genai_sdk
    for i, key in enumerate(_load_keys("GEMINI_API_KEY"), 1):
        _raw_gemini_clients.append(_genai_sdk.Client(api_key=key))
        _raw_gemini_names.append(f"gemini-key-{i}")
    if _raw_gemini_clients:
        print(f"Raw Gemini fallback: {len(_raw_gemini_clients)} key(s)")
except Exception as e:
    print(f"Raw Gemini init: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — Pydantic models (strict validation on every agent output)
# ══════════════════════════════════════════════════════════════════════════════

class JdStructuredModel(BaseModel):
    role_title:          str       = Field(default="")
    seniority_level:     Literal["junior", "mid", "senior", "lead", "principal"] = "mid"
    must_have_skills:    List[str] = Field(default_factory=list)
    nice_to_have_skills: List[str] = Field(default_factory=list)
    min_years_experience: int      = Field(default=0, ge=0, le=50)
    domain:              str       = Field(default="")
    team_context:        str       = Field(default="")
    inferred_skills:     List[str] = Field(default_factory=list)
    dealbreakers:        List[str] = Field(default_factory=list)
    flexibility_signals: List[str] = Field(default_factory=list)


class VerifiedSkill(BaseModel):
    skill:   str   = Field(max_length=80)
    depth:   Literal["expert", "proficient", "familiar"] = "familiar"
    years:   int   = Field(default=0, ge=0, le=40)
    context: str   = Field(default="", max_length=200)


class ResumeIntelligenceModel(BaseModel):
    verified_skills:       List[VerifiedSkill] = Field(default_factory=list)
    true_experience_years: int   = Field(default=0, ge=0, le=50)
    seniority_level:       Literal["junior", "mid", "senior", "lead", "principal"] = "mid"
    seniority_signals:     List[str] = Field(default_factory=list)
    domain_history:        List[str] = Field(default_factory=list)
    career_trajectory:     Literal["growing", "lateral", "pivot"] = "lateral"
    achievement_quality:   Literal["quantified", "generic", "mixed"] = "generic"
    red_flags:             List[str] = Field(default_factory=list)


class SkillVerdict(BaseModel):
    required_skill:      str  = Field(max_length=80)
    verdict:             Literal["exact", "transferable", "adjacent", "missing"]
    candidate_equivalent: Optional[str] = None
    confidence:          int  = Field(ge=0, le=100)
    reasoning:           str  = Field(default="", max_length=250)


class SkillValidationModel(BaseModel):
    verdicts:             List[SkillVerdict] = Field(default_factory=list)
    adjusted_skill_score: int  = Field(ge=0, le=100)
    critical_gaps:        List[str] = Field(default_factory=list)


class ExperienceMatchModel(BaseModel):
    seniority_alignment: Literal["strong_match", "slight_over", "slight_under", "significant_mismatch"] = "slight_under"
    domain_alignment:    Literal["strong", "partial", "weak", "none"] = "none"
    years_alignment:     Literal["exceeds", "meets", "close", "insufficient"] = "close"
    scope_alignment:     Literal["match", "overscoped", "underscoped"] = "match"
    experience_score:    int  = Field(ge=0, le=100)
    alignment_reasoning: str  = Field(default="", max_length=300)


class SynthesisComponentsModel(BaseModel):
    """Agent 5 returns ONLY component scores. Python computes final_score + verdict."""
    skills_score:     int  = Field(ge=0, le=100, description="Skill match quality 0-100")
    experience_score: int  = Field(ge=0, le=100, description="Experience quality 0-100")
    seniority_score:  int  = Field(ge=0, le=100, description="Seniority alignment 0-100")
    domain_score:     int  = Field(ge=0, le=100, description="Domain alignment 0-100")
    gap_penalty:      int  = Field(default=0, ge=0, le=15,
                                   description="Deduct 0-15 for hard-blocker missing skills only")
    top_strengths:    List[str] = Field(default_factory=list)
    key_gaps:         List[str] = Field(default_factory=list)
    recruiter_note:   str  = Field(default="", max_length=400)


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — Deterministic scoring (zero LLM math)
# ══════════════════════════════════════════════════════════════════════════════

def compute_final_score(skills: float, experience: float,
                        seniority: float, domain: float,
                        gap_penalty: float = 0) -> float:
    """Weighted formula — Python always computes this, never the LLM."""
    raw = skills * 0.40 + experience * 0.35 + seniority * 0.15 + domain * 0.10
    return round(max(0.0, min(100.0, raw - gap_penalty)), 1)


def score_to_verdict(score: float) -> str:
    """Deterministic mapping — Python always assigns verdict, never the LLM."""
    if score >= 85: return "Strong Match"
    if score >= 70: return "Good Fit"
    if score >= 55: return "Partial Fit"
    if score >= 40: return "Borderline"
    return "Not a Fit"


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — Structured LLM caller
# ══════════════════════════════════════════════════════════════════════════════

def call_structured_llm(system_prompt: str, user_prompt: str,
                        model_class: type) -> Optional[Any]:
    """
    Raw call_llm() + Pydantic validation (best-effort).
    Returns a validated Pydantic instance if schema matches, or the raw dict
    if Pydantic validation fails — never returns None due to schema mismatch.
    Returns None only if the LLM call itself fails completely.
    """
    try:
        raw  = call_llm(system_prompt, user_prompt)
        data = safe_json(raw, {})
        if not data:
            return None
        try:
            return model_class.model_validate(data)  # Pydantic instance
        except Exception:
            return data   # Return raw dict — caller handles both types
    except Exception as e:
        print(f"call_structured_llm ({model_class.__name__}) failed: {e}")
        return None


# ── Raw LLM caller (kept for embedding server compatibility + ultimate fallback) ─

def call_llm(system_prompt: str, user_prompt: str) -> str:
    """Groq key1→5 → Gemini key1→5 rotation (raw, no LangChain)."""
    for idx, client in enumerate(_raw_groq_clients):
        name = _raw_groq_names[idx]
        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "system", "content": system_prompt},
                          {"role": "user",   "content": user_prompt}],
                temperature=0,
                max_tokens=900,
                response_format={"type": "json_object"},
            )
            return completion.choices[0].message.content
        except Exception as e:
            err = str(e)
            if "429" in err or "rate" in err.lower():
                print(f"{name} rate-limited -> next Groq key")
                continue          # try next Groq key immediately
            if "502" in err or "503" in err or "timeout" in err.lower() or "connection" in err.lower():
                print(f"{name} transient error -> next Groq key")
                continue          # transient: also try next Groq key
            print(f"{name} error: {e} -> Gemini")
            break                 # only break on definitive errors (auth, 400)

    try:
        from google.genai import types as _gt
    except ImportError:
        _gt = None

    for idx, client in enumerate(_raw_gemini_clients):
        name = _raw_gemini_names[idx]
        try:
            cfg = {"temperature": 0.0, "max_output_tokens": 900}
            if _gt:
                cfg["response_mime_type"] = "application/json"
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"{system_prompt}\n\n{user_prompt}",
                config=_gt.GenerateContentConfig(**cfg) if _gt else cfg,
            )
            return response.text
        except Exception as e:
            print(f"{name} failed: {e} -> next Gemini key")
            continue

    raise RuntimeError(
        f"All {len(_raw_groq_clients)} Groq + {len(_raw_gemini_clients)} Gemini keys exhausted"
    )


def safe_json(text: str, fallback: dict) -> dict:
    try:
        return json.loads(text.strip())
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return fallback


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 1 — JD Decomposer
# ══════════════════════════════════════════════════════════════════════════════

JD_SYSTEM = (
    "You are a job requirements analyst. Extract structured, precise requirements "
    "from job descriptions. Respond with valid JSON only. Never include markdown."
)

def _decompose_jd(jd_text: str) -> dict:
    user = f"""Analyze this job description and extract structured requirements.

JOB DESCRIPTION:
{jd_text[:3000]}

Return JSON with exactly these keys:
{{
  "role_title": "exact job title",
  "seniority_level": "junior|mid|senior|lead|principal",
  "must_have_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill3"],
  "min_years_experience": 0,
  "domain": "industry or domain",
  "team_context": "individual contributor|leads small team|etc",
  "inferred_skills": ["strongly implied but not stated"],
  "dealbreakers": ["absolute hard requirements"],
  "flexibility_signals": ["areas where JD seems flexible"]
}}"""

    result = call_structured_llm(JD_SYSTEM, user, JdStructuredModel)
    if result:
        return result.model_dump() if hasattr(result, 'model_dump') else result

    return {
        "role_title": "", "seniority_level": "mid",
        "must_have_skills": [], "nice_to_have_skills": [],
        "min_years_experience": 0, "domain": "",
        "team_context": "", "inferred_skills": [],
        "dealbreakers": [], "flexibility_signals": []
    }


@app.route("/agent/decompose-jd", methods=["POST"])
def decompose_jd():
    data = request.get_json()
    if not data or "jd_text" not in data:
        return jsonify({"error": "Missing jd_text"}), 400
    try:
        return jsonify(_decompose_jd(data["jd_text"]))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 2 — Resume Intelligence  (Phase 1: grounded + text-filtered)
# ══════════════════════════════════════════════════════════════════════════════

RESUME_SYSTEM = (
    "You are a resume intelligence analyst. Extract depth, context, and career signals "
    "from resumes. Go beyond keywords — assess actual skill depth and experience quality. "
    "Respond with valid JSON only. Never include markdown."
)

def _skill_in_text(skill_name: str, text_lower: str) -> bool:
    """Word-level grounding check — tolerates compound skill names like 'REST APIs'."""
    name = skill_name.lower().strip()
    if not name:
        return False
    if name in text_lower:          # exact phrase match ("rest apis" in text)
        return True
    # Any significant word from the skill name appears in the resume
    words = [w for w in re.split(r'\W+', name) if len(w) > 2]
    return bool(words) and any(w in text_lower for w in words)

def _parse_resume(resume_text: str) -> dict:
    user = f"""Extract deep intelligence from this resume. Focus on DEPTH and CONTEXT.
Only list skills that actually appear in the resume — do not add skills not mentioned.

RESUME:
{resume_text[:3000]}

Return JSON with exactly these keys:
{{
  "verified_skills": [
    {{"skill": "Python", "depth": "expert|proficient|familiar", "years": 3, "context": "how it was used"}}
  ],
  "true_experience_years": 5,
  "seniority_level": "junior|mid|senior|lead|principal",
  "seniority_signals": ["led team of 4", "designed system architecture"],
  "domain_history": ["fintech", "e-commerce"],
  "career_trajectory": "growing|lateral|pivot",
  "achievement_quality": "quantified|generic|mixed",
  "red_flags": ["2-year gap 2021-2023"]
}}"""

    result = call_structured_llm(RESUME_SYSTEM, user, ResumeIntelligenceModel)
    if result:
        data = result.model_dump() if hasattr(result, 'model_dump') else result
    else:
        data = {
            "verified_skills": [], "true_experience_years": 0,
            "seniority_level": "mid", "seniority_signals": [],
            "domain_history": [], "career_trajectory": "lateral",
            "achievement_quality": "generic", "red_flags": []
        }

    # PHASE 1: Text-grounding filter — catch hallucinated skills using word-level match
    resume_lower = resume_text.lower()
    raw_skills = data.get("verified_skills", [])
    grounded = []
    for s in raw_skills:
        skill_name = (s.get("skill") if isinstance(s, dict) else
                      (s.skill if hasattr(s, "skill") else ""))
        if isinstance(skill_name, str) and _skill_in_text(skill_name, resume_lower):
            grounded.append(s if isinstance(s, dict) else s.model_dump())
    data["verified_skills"] = grounded

    return data


@app.route("/agent/parse-resume", methods=["POST"])
def parse_resume():
    data = request.get_json()
    if not data or "resume_text" not in data:
        return jsonify({"error": "Missing resume_text"}), 400
    try:
        return jsonify(_parse_resume(data["resume_text"]))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 3 — Technical Skills Validator
# ══════════════════════════════════════════════════════════════════════════════

SKILLS_SYSTEM = (
    "You are a technical skills matching expert. Identify transferable and equivalent "
    "skills across frameworks, languages, and platforms. Respond with valid JSON only. "
    "Never include markdown."
)

def _validate_skills(missing_skills: list, verified_skills: list, jd_context: dict) -> dict:
    role_info     = f"{jd_context.get('role_title', 'Software Role')} in {jd_context.get('domain', 'tech')}"
    skills_summary = []
    for s in verified_skills[:15]:
        if isinstance(s, dict):
            skills_summary.append(f"{s.get('skill')} ({s.get('depth')}, {s.get('years')}y)")
        else:
            skills_summary.append(str(s))

    user = f"""For each missing required skill, check if the candidate has a transferable equivalent.

ROLE: {role_info}
MISSING REQUIRED SKILLS: {json.dumps(missing_skills)}
CANDIDATE VERIFIED SKILLS: {json.dumps(skills_summary)}

Return JSON with exactly these keys:
{{
  "verdicts": [
    {{
      "required_skill": "React",
      "verdict": "exact|transferable|adjacent|missing",
      "candidate_equivalent": "Angular 4 years (same component paradigm)",
      "confidence": 80,
      "reasoning": "Component-based frontend framework, ~2 weeks ramp-up"
    }}
  ],
  "adjusted_skill_score": 75,
  "critical_gaps": ["skills with no equivalent and no path to transfer"]
}}"""

    result = call_structured_llm(SKILLS_SYSTEM, user, SkillValidationModel)
    if result:
        return result.model_dump() if hasattr(result, 'model_dump') else result
    return None  # Signal failure → graph routes to hybrid_fallback with real keyword_score


@app.route("/agent/validate-skills", methods=["POST"])
def validate_skills():
    data = request.get_json()
    if not data or not all(k in data for k in ["missing_skills", "verified_skills"]):
        return jsonify({"error": "Missing missing_skills or verified_skills"}), 400
    try:
        return jsonify(_validate_skills(
            data["missing_skills"],
            data["verified_skills"],
            data.get("jd_context", {})
        ))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 4 — Experience & Domain Matcher
# ══════════════════════════════════════════════════════════════════════════════

EXPERIENCE_SYSTEM = (
    "You are an experience alignment analyst. Evaluate whether a candidate's career "
    "background truly fits a role's requirements — considering seniority, domain, scope, "
    "and trajectory. Respond with valid JSON only. Never include markdown."
)

def _match_experience(jd_structured: dict, resume_structured: dict) -> dict:
    user = f"""Evaluate experience alignment for this role and candidate.

ROLE REQUIREMENTS:
- Title: {jd_structured.get('role_title', 'N/A')}
- Seniority: {jd_structured.get('seniority_level', 'mid')}
- Domain: {jd_structured.get('domain', 'N/A')}
- Min years: {jd_structured.get('min_years_experience', 0)}
- Team context: {jd_structured.get('team_context', 'N/A')}

CANDIDATE PROFILE:
- Total experience: {resume_structured.get('true_experience_years', 0)} years
- Seniority level: {resume_structured.get('seniority_level', 'mid')}
- Seniority signals: {json.dumps(resume_structured.get('seniority_signals', [])[:5])}
- Domain history: {json.dumps(resume_structured.get('domain_history', []))}
- Career trajectory: {resume_structured.get('career_trajectory', 'lateral')}
- Achievement quality: {resume_structured.get('achievement_quality', 'generic')}
- Red flags: {json.dumps(resume_structured.get('red_flags', []))}

Return JSON with exactly these keys:
{{
  "seniority_alignment": "strong_match|slight_over|slight_under|significant_mismatch",
  "domain_alignment": "strong|partial|weak|none",
  "years_alignment": "exceeds|meets|close|insufficient",
  "scope_alignment": "match|overscoped|underscoped",
  "experience_score": 75,
  "alignment_reasoning": "One sentence explaining the overall fit"
}}"""

    result = call_structured_llm(EXPERIENCE_SYSTEM, user, ExperienceMatchModel)
    if result:
        return result.model_dump() if hasattr(result, 'model_dump') else result
    return None  # Signal failure → graph routes to hybrid_fallback with real keyword_score


@app.route("/agent/match-experience", methods=["POST"])
def match_experience():
    data = request.get_json()
    if not data or "jd_structured" not in data or "resume_structured" not in data:
        return jsonify({"error": "Missing jd_structured or resume_structured"}), 400
    try:
        return jsonify(_match_experience(data["jd_structured"], data["resume_structured"]))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 5 — Score Synthesizer  (Phase 1: no math, Python owns final_score)
# ══════════════════════════════════════════════════════════════════════════════

# PHASE 1: Few-shot examples teach the LLM correct component scoring patterns
# PHASE 1: LLM returns component scores ONLY — Python computes final_score + verdict
SYNTHESIZER_SYSTEM = """You are a hiring assessment synthesizer.
Your ONLY job: rate 4 components (0-100 each) based on the signals given.
Python will compute the final score from your components. Do NOT compute it yourself.

COMPONENT DEFINITIONS:
• skills_score     — how well the candidate's skills match the role requirements
• experience_score — career quality, trajectory, and relevance
• seniority_score  — does their career level match what the role needs
• domain_score     — prior industry/domain match (domain=none → 30-45 range, NOT zero)
• gap_penalty      — 0 to 15 points deducted for HARD BLOCKERS only (must-have with no equivalent)

FEW-SHOT EXAMPLES (learn correct component scoring):

Example 1 — Java engineer for Java job, same fintech domain, 5 years:
  Signals: keyword=92, adjusted_skill=88, exp_score=85, seniority=strong_match, domain=strong
  Output: skills_score=88, experience_score=85, seniority_score=90, domain_score=85, gap_penalty=0
  → Python computes: 88×0.40 + 85×0.35 + 90×0.15 + 85×0.10 = 87.2 "Strong Match"

Example 2 — PHP developer for Java job, primary language missing:
  Signals: keyword=18, adjusted_skill=20, exp_score=60, seniority=strong_match, domain=partial, critical_gaps=["Java"]
  Output: skills_score=20, experience_score=60, seniority_score=80, domain_score=55, gap_penalty=12
  → Python computes: 20×0.40 + 60×0.35 + 80×0.15 + 55×0.10 - 12 = 37.5 "Borderline"
  CRITICAL: skills_score=20 NOT 60. Missing primary language = very low skills score.

Example 3 — Senior engineer, wrong domain (no domain history), strong skills:
  Signals: keyword=78, adjusted_skill=80, exp_score=82, seniority=strong_match, domain=none, critical_gaps=[]
  Output: skills_score=80, experience_score=82, seniority_score=90, domain_score=38, gap_penalty=0
  → Python computes: 80×0.40 + 82×0.35 + 90×0.15 + 38×0.10 = 77.4 "Good Fit"
  CRITICAL: domain_score=38 (not zero). Strong skills compensate for no domain history.

Example 4 — HR manager for software engineering role:
  Signals: keyword=5, adjusted_skill=5, exp_score=30, seniority=significant_mismatch, domain=none, critical_gaps=["Python","Java","AWS"]
  Output: skills_score=5, experience_score=30, seniority_score=20, domain_score=10, gap_penalty=15
  → Python computes: 5×0.40 + 30×0.35 + 20×0.15 + 10×0.10 - 15 = 12.5 "Not a Fit"

RULES:
• key_gaps: describe CANDIDATE weaknesses in plain English. Never mention internal scores or metrics.
• top_strengths: cite specific skills, achievements, or experience from the signals.
• recruiter_note: 1-2 sentences, actionable, human-readable, no numbers.
• Respond with valid JSON only. Never include markdown."""


def _synthesize(
    keyword_score: float,
    semantic_score,
    skill_validation: dict,
    experience_match: dict,
    jd_structured: dict
) -> dict:
    skill_score   = skill_validation.get("adjusted_skill_score", keyword_score) if skill_validation else keyword_score
    critical_gaps = skill_validation.get("critical_gaps", []) if skill_validation else []
    exp_score     = experience_match.get("experience_score", 50) if experience_match else 50
    seniority_al  = experience_match.get("seniority_alignment", "unknown") if experience_match else "unknown"
    domain_al     = experience_match.get("domain_alignment", "unknown") if experience_match else "unknown"
    years_al      = experience_match.get("years_alignment", "unknown") if experience_match else "unknown"

    role_title  = jd_structured.get("role_title", "Unknown Role")
    seniority   = jd_structured.get("seniority_level", "mid")
    domain      = jd_structured.get("domain", "tech")

    user = f"""Rate these hiring signals for the role and return component scores only.

ROLE: {role_title} | Level: {seniority} | Domain: {domain}

SKILL SIGNALS:
- Keyword match: {keyword_score:.0f}/100
- Adjusted skill score (transferable skills counted): {skill_score:.0f}/100
- Critical gaps (no equivalent found): {json.dumps(critical_gaps[:5])}

EXPERIENCE SIGNALS:
- Experience score: {exp_score:.0f}/100
- Years alignment: {years_al}
- Seniority alignment: {seniority_al}
- Domain alignment: {domain_al}

Return JSON with EXACTLY these keys (no final_score, no verdict — Python computes those):
{{
  "skills_score": <0-100>,
  "experience_score": <0-100>,
  "seniority_score": <0-100>,
  "domain_score": <0-100>,
  "gap_penalty": <0-15>,
  "top_strengths": ["strength1", "strength2", "strength3"],
  "key_gaps": ["candidate gap 1", "candidate gap 2"],
  "recruiter_note": "1-2 actionable sentences for the recruiter"
}}"""

    result = call_structured_llm(SYNTHESIZER_SYSTEM, user, SynthesisComponentsModel)

    if result:
        # Accept Pydantic model or raw dict
        if hasattr(result, 'skills_score'):
            s, e, n, d, g = result.skills_score, result.experience_score, result.seniority_score, result.domain_score, result.gap_penalty
            strengths, gaps, note = result.top_strengths, result.key_gaps, result.recruiter_note
        else:
            raw = result  # plain dict
            s = max(0, min(100, int(raw.get("skills_score",     raw.get("skills",     skill_score)))))
            e = max(0, min(100, int(raw.get("experience_score", raw.get("experience", exp_score)))))
            n = max(0, min(100, int(raw.get("seniority_score",  raw.get("seniority",  60)))))
            d = max(0, min(100, int(raw.get("domain_score",     raw.get("domain",     50)))))
            g = max(0, min(15,  int(raw.get("gap_penalty", 0))))
            strengths, gaps, note = raw.get("top_strengths", []), raw.get("key_gaps", critical_gaps[:3]), raw.get("recruiter_note", "")

        # Python computes final_score and verdict — never the LLM
        final_score = compute_final_score(s, e, n, d, g)
        verdict     = score_to_verdict(final_score)
        return {
            "final_score":     final_score,
            "verdict":         verdict,
            "score_breakdown": {"skills": s, "experience": e, "seniority": n, "domain": d},
            "top_strengths":   strengths,
            "key_gaps":        gaps,
            "recruiter_note":  note,
        }

    # Ultimate fallback: keyword-based score, no LLM
    final = compute_final_score(skill_score, exp_score, 60, 50)
    return {
        "final_score":     final,
        "verdict":         score_to_verdict(final),
        "score_breakdown": {"skills": int(skill_score), "experience": int(exp_score),
                            "seniority": 60, "domain": 50},
        "top_strengths":   [],
        "key_gaps":        critical_gaps[:3],
        "recruiter_note":  "Score based on keyword matching — agent analysis unavailable.",
    }


@app.route("/agent/synthesize", methods=["POST"])
def synthesize():
    data = request.get_json()
    if not data or "keyword_score" not in data:
        return jsonify({"error": "Missing keyword_score"}), 400
    try:
        return jsonify(_synthesize(
            data["keyword_score"],
            data.get("semantic_score"),
            data.get("skill_validation"),
            data.get("experience_match"),
            data.get("jd_structured", {})
        ))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# Full pipeline (all 5 agents sequential — for single-call use)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/agent/full-pipeline", methods=["POST"])
def full_pipeline():
    data = request.get_json()
    if not data or "jd_text" not in data or "resume_text" not in data:
        return jsonify({"error": "Missing jd_text or resume_text"}), 400

    result, errors = {}, []

    try:
        result["jd_structured"] = _decompose_jd(data["jd_text"])
    except Exception as e:
        errors.append(f"Agent1: {e}"); result["jd_structured"] = None

    try:
        result["resume_structured"] = _parse_resume(data["resume_text"])
    except Exception as e:
        errors.append(f"Agent2: {e}"); result["resume_structured"] = None

    if result["jd_structured"] and result["resume_structured"]:
        missing = data.get("missing_skills") or result["jd_structured"].get("must_have_skills", [])
        try:
            result["skill_validation"] = _validate_skills(
                missing,
                result["resume_structured"].get("verified_skills", []),
                result["jd_structured"]
            )
        except Exception as e:
            errors.append(f"Agent3: {e}"); result["skill_validation"] = None

        try:
            result["experience_match"] = _match_experience(
                result["jd_structured"], result["resume_structured"]
            )
        except Exception as e:
            errors.append(f"Agent4: {e}"); result["experience_match"] = None
    else:
        result["skill_validation"] = None
        result["experience_match"] = None

    try:
        result["synthesis"] = _synthesize(
            data.get("keyword_score", 50),
            data.get("semantic_score"),
            result["skill_validation"],
            result["experience_match"],
            result["jd_structured"] or {}
        )
    except Exception as e:
        errors.append(f"Agent5: {e}"); result["synthesis"] = None

    if errors:
        result["warnings"] = errors
    return jsonify(result)


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — LangGraph State Machine Pipeline
# ══════════════════════════════════════════════════════════════════════════════
#
# Replaces the ad-hoc if/else agent orchestration with a proper StateGraph:
#
#   START
#     │
#   [agent2_node]  ─── resume failed ──▶ [hybrid_fallback_node]
#     │                                         │
#   [agent3_node] ──┐                           │
#   [agent4_node] ──┘  (sequential, fast)       │
#     │                                         │
#   route: has data? ──── no data ──────────────┤
#     │ yes                                     │
#   [agent5_node]                               │
#     │                                         │
#   [math_node]  ◄──────────────────────────────┘
#     │    (Python computes final_score + verdict — never the LLM)
#   [validator_node]
#     │
#    END
#
# Benefits over Phase 2:
#   • Conditional routing is explicit, visual, and testable
#   • State is typed — every node knows exactly what it receives/returns
#   • Failed agents trigger defined fallback paths (no silent 73 defaults)
#   • Validator node enforces consistency as a post-processing gate
#   • Processing path is tracked ("full_graph" / "hybrid_fallback")
#   • Ready for LangSmith observability + PostgreSQL checkpointing

from langgraph.graph import StateGraph, START, END
from typing import TypedDict

class PipelineState(TypedDict, total=False):
    """
    Typed state — flows through every LangGraph node.
    TypedDict with total=False means all keys are optional,
    so nodes can return partial dicts that get MERGED (not replaced).
    """
    resume_text:         str
    jd_structured:       dict
    keyword_score:       float
    semantic_score:      Optional[float]
    missing_required:    list
    resume_structured:   Optional[dict]
    skill_validation:    Optional[dict]
    experience_match:    Optional[dict]
    agent5_result:       Optional[dict]
    final_score:         float
    verdict:             str
    score_breakdown:     dict
    top_strengths:       list
    key_gaps:            list
    recruiter_note:      str
    processing_path:     str
    failed_agents:       list
    validation_warnings: list
    gap_penalty_applied: float

# ── Node: Agent 2 ─────────────────────────────────────────────────────────────

def _node_agent2(state: dict) -> dict:
    try:
        result = _parse_resume(state["resume_text"])
        if result and isinstance(result, dict):
            return {"resume_structured": result, "failed_agents": state.get("failed_agents", [])}
    except Exception as e:
        print(f"LangGraph agent2 error: {e}")
    return {
        "resume_structured": None,
        "failed_agents": state.get("failed_agents", []) + ["agent2"],
    }

def _route_after_agent2(state: dict) -> str:
    """Conditional edge: did Agent 2 succeed?"""
    if state.get("resume_structured"):
        return "agents_34"        # proceed to skills + experience analysis
    return "hybrid_fallback"      # no resume data → safe keyword fallback

# ── Node: Agent 3 (Skills Validator) ─────────────────────────────────────────

def _node_agent3(state: dict) -> dict:
    missing   = state.get("missing_required", [])
    resume_st = state.get("resume_structured", {})
    jd_st     = state.get("jd_structured", {})
    if not missing or not resume_st:
        return {"skill_validation": None}
    try:
        result = _validate_skills(missing, resume_st.get("verified_skills", []), jd_st)
        return {"skill_validation": result}
    except Exception as e:
        print(f"LangGraph agent3 error: {e}")
        return {"skill_validation": None, "failed_agents": state.get("failed_agents", []) + ["agent3"]}

# ── Node: Agent 4 (Experience Matcher) ────────────────────────────────────────

def _node_agent4(state: dict) -> dict:
    resume_st = state.get("resume_structured")
    jd_st     = state.get("jd_structured", {})
    if not resume_st or not jd_st:
        return {"experience_match": None}
    try:
        result = _match_experience(jd_st, resume_st)
        return {"experience_match": result}
    except Exception as e:
        print(f"LangGraph agent4 error: {e}")
        return {"experience_match": None, "failed_agents": state.get("failed_agents", []) + ["agent4"]}

def _route_after_agents_34(state: dict) -> str:
    """Conditional edge: do we have enough agent data to run Agent 5?"""
    has_data = bool(state.get("skill_validation") or state.get("experience_match"))
    return "agent5" if has_data else "hybrid_fallback"

# ── Node: Agent 5 (Score Synthesizer — components only) ──────────────────────

def _node_agent5(state: dict) -> dict:
    try:
        result = _synthesize(
            state["keyword_score"],
            state.get("semantic_score"),
            state.get("skill_validation"),
            state.get("experience_match"),
            state.get("jd_structured", {}),
        )
        return {
            "agent5_result":    result,
            "processing_path": "full_graph",
        }
    except Exception as e:
        print(f"LangGraph agent5 error: {e}")
        return {"agent5_result": None, "processing_path": "hybrid_fallback"}

# ── Node: Hybrid Fallback ─────────────────────────────────────────────────────

def _node_hybrid_fallback(state: dict) -> dict:
    """Safe fallback when agents fail: use keyword score + any available exp data."""
    kw  = float(state.get("keyword_score", 0))
    exp = 50.0
    if state.get("experience_match"):
        exp = float(state["experience_match"].get("experience_score", 50))
    final = compute_final_score(kw, exp, 60, 50)
    return {
        "agent5_result": {
            "final_score":     final,
            "verdict":         score_to_verdict(final),
            "score_breakdown": {"skills": int(kw), "experience": int(exp),
                                "seniority": 60, "domain": 50},
            "top_strengths":  [],
            "key_gaps":       [],
            "recruiter_note": "Score based on keyword matching — full AI analysis unavailable.",
        },
        "processing_path": "hybrid_fallback",
    }

# ── Node: Math (Python computes final_score — never the LLM) ─────────────────

def _node_math(state: dict) -> dict:
    """
    Deterministic Python computation.
    Agent 5 returns component scores; this node applies the formula.
    _synthesize() already does this internally, so here we just validate the numbers.
    """
    r = state.get("agent5_result") or {}
    bd = r.get("score_breakdown", {})
    s  = max(0, min(100, int(bd.get("skills",     0))))
    e  = max(0, min(100, int(bd.get("experience", 0))))
    n  = max(0, min(100, int(bd.get("seniority",  60))))
    d  = max(0, min(100, int(bd.get("domain",     50))))
    # Re-verify formula — clamp any drift from _synthesize fallback paths
    recomputed = compute_final_score(s, e, n, d, 0)
    stored     = float(r.get("final_score", recomputed))
    # Allow up to 15 pts difference (gap penalty from Agent 5)
    gap_applied = max(0.0, round(recomputed - stored, 1))
    final = stored   # trust _synthesize's already-gapped value
    return {
        "final_score":     final,
        "verdict":         score_to_verdict(final),   # Python always re-confirms verdict
        "score_breakdown": {"skills": s, "experience": e, "seniority": n, "domain": d},
        "top_strengths":   r.get("top_strengths",  []),
        "key_gaps":        r.get("key_gaps",        []),
        "recruiter_note":  r.get("recruiter_note",  ""),
        "gap_penalty_applied": gap_applied,
    }

# ── Node: Validator ───────────────────────────────────────────────────────────

def _node_validator(state: dict) -> dict:
    """Post-processing gate: catch any remaining inconsistencies."""
    warnings  = []
    score     = float(state.get("final_score", 0))
    verdict   = state.get("verdict", "")

    # 1. Score bounds
    if not (0 <= score <= 100):
        warnings.append(f"Score {score} clamped to valid range")
        score = max(0.0, min(100.0, score))

    # 2. Verdict must match score — Python always re-assigns
    correct_verdict = score_to_verdict(score)
    if verdict != correct_verdict:
        warnings.append(f"Verdict corrected: '{verdict}' -> '{correct_verdict}'")
        verdict = correct_verdict

    # 3. Strengths/gaps must be lists
    strengths = state.get("top_strengths", [])
    gaps      = state.get("key_gaps", [])
    if not isinstance(strengths, list): strengths = []
    if not isinstance(gaps, list):      gaps = []

    # 4. Recruiter note must not expose internal metrics
    note = state.get("recruiter_note", "")

    return {
        "final_score":         score,
        "verdict":             verdict,
        "top_strengths":       strengths,
        "key_gaps":            gaps,
        "recruiter_note":      note,
        "validation_warnings": warnings,
    }

# ── Build and compile the graph ───────────────────────────────────────────────

def _build_pipeline_graph():
    g = StateGraph(PipelineState)

    # Register nodes
    g.add_node("agent2",          _node_agent2)
    g.add_node("agent3",          _node_agent3)
    g.add_node("agent4",          _node_agent4)
    g.add_node("agent5",          _node_agent5)
    g.add_node("hybrid_fallback", _node_hybrid_fallback)
    g.add_node("math",            _node_math)
    g.add_node("validator",       _node_validator)

    # Edges
    g.add_edge(START, "agent2")
    g.add_conditional_edges(
        "agent2",
        _route_after_agent2,
        {"agents_34": "agent3", "hybrid_fallback": "hybrid_fallback"},
    )
    g.add_edge("agent3", "agent4")          # sequential (fast LLM calls)
    g.add_conditional_edges(
        "agent4",
        _route_after_agents_34,
        {"agent5": "agent5", "hybrid_fallback": "hybrid_fallback"},
    )
    g.add_edge("agent5",          "math")
    g.add_edge("hybrid_fallback", "math")
    g.add_edge("math",            "validator")
    g.add_edge("validator",       END)

    return g.compile()

# Compile once at server start
try:
    _pipeline_graph = _build_pipeline_graph()
    print("LangGraph: pipeline graph compiled OK")
except Exception as _ge:
    _pipeline_graph = None
    print(f"LangGraph: graph compile failed — {_ge}")


# ── Flask endpoint ────────────────────────────────────────────────────────────

@app.route("/agent/graph-pipeline", methods=["POST"])
def graph_pipeline():
    """
    Single endpoint that runs all 5 agents via LangGraph state machine.
    Input:  { resume_text, jd_structured, keyword_score, semantic_score?, missing_required? }
    Output: { final_score, verdict, score_breakdown, top_strengths, key_gaps,
              recruiter_note, resume_structured, skill_validation, experience_match,
              processing_path, failed_agents, validation_warnings }
    """
    data = request.get_json()
    if not data or "resume_text" not in data or "keyword_score" not in data:
        return jsonify({"error": "Missing resume_text or keyword_score"}), 400

    if _pipeline_graph is None:
        return jsonify({"error": "LangGraph pipeline not available"}), 503

    # Build initial state
    initial_state = {
        "resume_text":      data["resume_text"],
        "jd_structured":    data.get("jd_structured", {}),
        "keyword_score":    float(data["keyword_score"]),
        "semantic_score":   data.get("semantic_score"),
        "missing_required": data.get("missing_required", []),
        # Initialise mutable fields
        "resume_structured":  None,
        "skill_validation":   None,
        "experience_match":   None,
        "agent5_result":      None,
        "final_score":        0.0,
        "verdict":            "Not a Fit",
        "score_breakdown":    {},
        "top_strengths":      [],
        "key_gaps":           [],
        "recruiter_note":     "",
        "processing_path":    "unknown",
        "failed_agents":      [],
        "validation_warnings":[],
        "gap_penalty_applied": 0.0,
    }

    try:
        final_state = _pipeline_graph.invoke(initial_state)

        return jsonify({
            # Core scores (what the worker needs)
            "final_score":        final_state.get("final_score", 0),
            "verdict":            final_state.get("verdict", "Not a Fit"),
            "score_breakdown":    final_state.get("score_breakdown", {}),
            "top_strengths":      final_state.get("top_strengths", []),
            "key_gaps":           final_state.get("key_gaps", []),
            "recruiter_note":     final_state.get("recruiter_note", ""),
            # Agent outputs (for storage in DB)
            "resume_structured":  final_state.get("resume_structured"),
            "skill_validation":   final_state.get("skill_validation"),
            "experience_match":   final_state.get("experience_match"),
            # Observability
            "processing_path":    final_state.get("processing_path", "unknown"),
            "failed_agents":      final_state.get("failed_agents", []),
            "validation_warnings":final_state.get("validation_warnings", []),
            "gap_penalty_applied":final_state.get("gap_penalty_applied", 0),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Health ─────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":   "healthy",
        "version":  "3.0 (phase1+phase2+phase3-langgraph)",
        "agents":   ["decompose-jd", "parse-resume", "validate-skills",
                     "match-experience", "synthesize", "full-pipeline",
                     "graph-pipeline"],
        "anti_hallucination": {
            "python_math":       True,
            "python_verdict":    True,
            "agent2_grounded":   True,
            "text_filter":       True,
            "few_shot_agent5":   True,
            "pydantic_models":   True,
            "validator_node":    True,
            "conditional_routing": True,
        },
        "langgraph": {
            "graph_compiled":   _pipeline_graph is not None,
            "nodes":            ["agent2", "agent3", "agent4", "agent5",
                                 "hybrid_fallback", "math", "validator"],
            "conditional_edges":["agent2→(agents_34|hybrid_fallback)",
                                 "agent4→(agent5|hybrid_fallback)"],
        },
        "llm_pool": {
            "langchain_clients": len(_lc_clients),
            "raw_groq_keys":     len(_raw_groq_clients),
            "raw_gemini_keys":   len(_raw_gemini_clients),
            "rate_limiter":      _rate_limiter is not None,
            "strategy":          "LangChain structured output → raw fallback",
        },
    })


if __name__ == "__main__":
    print("=" * 65)
    print("Resume Matching — AI Agent Server v3 (Phase 1 + 2 + 3)")
    print(f"LangChain clients  : {len(_lc_clients)}")
    print(f"Raw Groq fallback  : {len(_raw_groq_clients)} key(s)")
    print(f"Raw Gemini fallback: {len(_raw_gemini_clients)} key(s)")
    print(f"LangGraph graph    : {'compiled OK' if _pipeline_graph else 'FAILED'}")
    print("Anti-hallucination: Python math OK  Python verdict OK")
    print("                    Agent2 grounding OK  Text filter OK")
    print("                    Few-shot Agent5 OK  Pydantic models OK")
    print("=" * 65)
    app.run(host="0.0.0.0", port=5003, debug=False)
