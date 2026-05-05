"""
Local Embedding Server — MiniLM/BGE + Section Embeddings + Multi-provider LLM Scoring
LLM providers (in order): Groq → Gemini → Ollama (local)
Endpoints:
  GET  /health           — status + provider availability
  POST /embed            — single embedding
  POST /batch-embed      — batch embeddings
  POST /embed-sections   — section-level embeddings (skills/experience/education/summary)
  POST /llm-score        — LLM re-ranking via Groq / Gemini / Ollama
"""

import os
import re
import json
import requests
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer

# ── Load env from backend/.env ─────────────────────────────────────────────────
_env_path = Path(__file__).parent / "backend" / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

OLLAMA_URL = "http://localhost:11434"

app = Flask(__name__)
CORS(app)

# ── Embedding model ────────────────────────────────────────────────────────────
_CANDIDATE_MODELS = [
    "all-MiniLM-L6-v2",
    "BAAI/bge-small-en-v1.5",
    "BAAI/bge-base-en-v1.5",
    "BAAI/bge-large-en-v1.5",
]

model = None
MODEL_NAME = None
for _name in _CANDIDATE_MODELS:
    try:
        print(f"Trying model: {_name} ...")
        _m = SentenceTransformer(_name)
        _m.encode("test", normalize_embeddings=True)
        model = _m
        MODEL_NAME = _name
        print(f"Model loaded: {MODEL_NAME}  ({_m.get_sentence_embedding_dimension()}-dim)")
        break
    except Exception as _e:
        print(f"  Failed ({_e}), trying next ...")

if model is None:
    raise RuntimeError("No embedding model could be loaded")

DIM = model.get_sentence_embedding_dimension()


# ── Multi-key LLM pool ────────────────────────────────────────────────────────

def _load_keys(prefix: str) -> list:
    return [v for v in [os.environ.get(f"{prefix}{s}", "").strip()
                        for s in ("", "_2", "_3", "_4", "_5")] if v]

_groq_clients   = []
_groq_key_names = []
try:
    from groq import Groq as _GroqSDK
    for _i, _key in enumerate(_load_keys("GROQ_API_KEY"), 1):
        _groq_clients.append(_GroqSDK(api_key=_key))
        _groq_key_names.append(f"groq-key-{_i}")
    if _groq_clients:
        print(f"LLM provider: {len(_groq_clients)} Groq key(s) ready  (llama-3.3-70b-versatile)")
except Exception as _e:
    print(f"Groq init failed: {_e}")

_gemini_clients   = []
_gemini_key_names = []
try:
    from google import genai as _genai_sdk
    for _i, _key in enumerate(_load_keys("GEMINI_API_KEY"), 1):
        _gemini_clients.append(_genai_sdk.Client(api_key=_key))
        _gemini_key_names.append(f"gemini-key-{_i}")
    if _gemini_clients:
        print(f"LLM provider: {len(_gemini_clients)} Gemini key(s) ready  (gemini-2.5-flash)")
except Exception as _e:
    print(f"Gemini init failed: {_e}")

if not _groq_clients and not _gemini_clients:
    print("LLM provider: no API keys found — falling back to Ollama only")


# ── BGE prefix helper ──────────────────────────────────────────────────────────

def add_prefix(text: str, text_type: str) -> str:
    if text_type == "query":
        return "Represent this sentence for searching relevant passages: " + text
    return text


# ── Section splitter ───────────────────────────────────────────────────────────

SECTION_PATTERNS = {
    "skills": re.compile(
        r"(?:technical\s+)?skills?(?:\s+&\s+\w+)?|technologies|tech\s+stack|"
        r"competencies|proficiencies|tools\s+&\s+technologies",
        re.IGNORECASE,
    ),
    "experience": re.compile(
        r"(?:work\s+)?experience|employment(?:\s+history)?|professional\s+(?:background|experience)|"
        r"work\s+history|career\s+history|positions?\s+held",
        re.IGNORECASE,
    ),
    "education": re.compile(
        r"education(?:al\s+background)?|academic(?:\s+background)?|"
        r"qualifications?|degrees?|university|college",
        re.IGNORECASE,
    ),
    "summary": re.compile(
        r"(?:professional\s+)?summary|(?:career\s+)?objective|profile|about\s+me|"
        r"overview|introduction",
        re.IGNORECASE,
    ),
}

SECTION_ORDER = ["summary", "skills", "experience", "education"]


def split_into_sections(text: str) -> dict:
    lines = text.split("\n")
    sections = {k: [] for k in SECTION_ORDER}
    current_section = "summary"

    for line in lines:
        stripped = line.strip()
        matched_section = None
        for sec, pattern in SECTION_PATTERNS.items():
            if len(stripped) <= 60 and pattern.search(stripped):
                matched_section = sec
                break
        if matched_section:
            current_section = matched_section
        else:
            sections[current_section].append(line)

    result = {}
    for sec in SECTION_ORDER:
        content = "\n".join(sections[sec]).strip()
        result[sec] = content if content else ""

    if not result["summary"]:
        result["summary"] = text[:500]

    if not result["skills"]:
        skill_lines = [l for l in text.split("\n") if re.search(
            r"\b(python|java|javascript|typescript|react|node|sql|aws|docker|kubernetes|"
            r"machine learning|deep learning|tensorflow|pytorch|nlp|git|linux|api)\b",
            l, re.IGNORECASE
        )]
        result["skills"] = "\n".join(skill_lines[:20]) or text[:300]

    return result


# ── Health ─────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    ollama_ok = False
    ollama_models = []
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if r.status_code == 200:
            ollama_ok = True
            ollama_models = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        pass

    active = (
        "groq"   if _groq_clients else
        "gemini" if _gemini_clients else
        "ollama" if ollama_ok else
        "none"
    )

    return jsonify({
        "status":    "healthy",
        "model":     MODEL_NAME,
        "dimension": DIM,
        "llm_pool": {
            "groq_keys":    len(_groq_clients),
            "gemini_keys":  len(_gemini_clients),
            "ollama":       {"available": ollama_ok, "models": ollama_models},
        },
        "active_llm": active,
    })


# ── Embed ──────────────────────────────────────────────────────────────────────

@app.route("/embed", methods=["POST"])
def embed():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": 'Missing "text" field'}), 400

    text = str(data["text"])[:12000]
    text_type = data.get("type", "passage")
    if text_type not in ("query", "passage"):
        return jsonify({"error": 'type must be "query" or "passage"'}), 400

    prefixed = add_prefix(text, text_type)
    embedding = model.encode(prefixed, convert_to_tensor=False, normalize_embeddings=True)

    return jsonify({
        "embedding": embedding.tolist(),
        "dimension": len(embedding),
        "model":     MODEL_NAME,
        "type":      text_type,
    })


# ── Batch embed ────────────────────────────────────────────────────────────────

@app.route("/batch-embed", methods=["POST"])
def batch_embed():
    data = request.get_json()
    if not data or "texts" not in data:
        return jsonify({"error": 'Missing "texts" field'}), 400

    texts = data["texts"]
    if not isinstance(texts, list):
        return jsonify({"error": '"texts" must be a list'}), 400

    text_type = data.get("type", "passage")
    prefixed   = [add_prefix(str(t)[:12000], text_type) for t in texts]
    embeddings = model.encode(prefixed, convert_to_tensor=False, normalize_embeddings=True)

    return jsonify({
        "embeddings": [e.tolist() for e in embeddings],
        "count":      len(embeddings),
        "dimension":  DIM,
        "model":      MODEL_NAME,
    })


# ── Section embeddings ─────────────────────────────────────────────────────────

@app.route("/embed-sections", methods=["POST"])
def embed_sections():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": 'Missing "text" field'}), 400

    text      = str(data["text"])[:12000]
    text_type = data.get("type", "passage")
    sections  = split_into_sections(text)

    result = {}
    for sec, content in sections.items():
        if content.strip():
            prefixed = add_prefix(content[:4000], text_type)
            emb = model.encode(prefixed, convert_to_tensor=False, normalize_embeddings=True)
            result[sec] = emb.tolist()
        else:
            result[sec] = []

    return jsonify({"embeddings": result, "model": MODEL_NAME, "dimension": DIM})


# ── LLM scoring ────────────────────────────────────────────────────────────────

LLM_PROMPT_TEMPLATE = """You are an expert ATS (Applicant Tracking System) evaluator.

Evaluate how well the following RESUME matches the JOB DESCRIPTION.
Score each dimension from 0 to 100, where 100 = perfect match.

JOB DESCRIPTION:
{jd_text}

RESUME:
{resume_text}

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{{
  "skill_match": <0-100>,
  "experience_relevance": <0-100>,
  "education_fit": <0-100>,
  "overall_recommendation": <0-100>,
  "key_strengths": ["strength1", "strength2", "strength3"],
  "key_gaps": ["gap1", "gap2", "gap3"]
}}"""


def extract_json(text: str) -> dict:
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
    return {}


def _call_ollama(prompt: str, llm_model: str = "mistral") -> str:
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": llm_model, "prompt": prompt, "stream": False, "format": "json"},
        timeout=180,
    )
    response.raise_for_status()
    return response.json().get("response", "")


def call_llm(prompt: str, preferred_model: str = "mistral") -> tuple:
    """Rotate all Groq keys → all Gemini keys → Ollama. Returns (text, provider)."""

    # ── Groq pool ─────────────────────────────────────────────────────────────
    for idx, client in enumerate(_groq_clients):
        name = _groq_key_names[idx]
        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are an ATS evaluator. Always respond with valid JSON only."},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.1,
                max_tokens=512,
                response_format={"type": "json_object"},
            )
            return completion.choices[0].message.content, f"groq/{name}"
        except Exception as e:
            if "429" in str(e):
                print(f"{name} rate-limited → next Groq key")
                continue
            print(f"{name} error: {e} → Gemini")
            break

    # ── Gemini pool ───────────────────────────────────────────────────────────
    from google.genai import types as _gt
    for idx, client in enumerate(_gemini_clients):
        name = _gemini_key_names[idx]
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=_gt.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                    max_output_tokens=512,
                ),
            )
            return response.text, f"gemini/{name}"
        except Exception as e:
            print(f"{name} failed: {e} → next Gemini key")
            continue

    # ── Ollama last resort ────────────────────────────────────────────────────
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if r.status_code == 200:
            return _call_ollama(prompt, preferred_model), f"ollama/{preferred_model}"
    except Exception:
        pass

    raise RuntimeError(
        f"All providers exhausted: {len(_groq_clients)} Groq + {len(_gemini_clients)} Gemini + Ollama"
    )


@app.route("/llm-score", methods=["POST"])
def llm_score():
    data = request.get_json()
    if not data or "jd_text" not in data or "resume_text" not in data:
        return jsonify({"error": 'Missing "jd_text" or "resume_text"'}), 400

    jd_text     = str(data["jd_text"])[:4000]
    resume_text = str(data["resume_text"])[:4000]
    ollama_model = data.get("model", "mistral")

    # Bail early if nothing is available
    if not _groq_clients and not _gemini_clients:
        ollama_ok = False
        try:
            r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
            ollama_ok = r.status_code == 200
        except Exception:
            pass
        if not ollama_ok:
            return jsonify({
                "error": (
                    "No LLM provider available. "
                    "Set GROQ_API_KEY or GEMINI_API_KEY in backend/.env, "
                    "or install Ollama from https://ollama.ai"
                )
            }), 503

    prompt = LLM_PROMPT_TEMPLATE.format(jd_text=jd_text, resume_text=resume_text)

    try:
        raw, provider = call_llm(prompt, ollama_model)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    parsed = extract_json(raw)

    def clamp(val, default=50):
        try:
            return max(0, min(100, int(val)))
        except (TypeError, ValueError):
            return default

    return jsonify({
        "skill_match":            clamp(parsed.get("skill_match")),
        "experience_relevance":   clamp(parsed.get("experience_relevance")),
        "education_fit":          clamp(parsed.get("education_fit")),
        "overall_recommendation": clamp(parsed.get("overall_recommendation")),
        "key_strengths":          parsed.get("key_strengths") or [],
        "key_gaps":               parsed.get("key_gaps") or [],
        "raw_response":           raw[:500],
        "provider":               provider,
    })


if __name__ == "__main__":
    print("=" * 65)
    print("Resume Matching — Embedding + LLM Server")
    print(f"Embedding : {MODEL_NAME}  ({DIM}-dim)")
    print(f"LLM pool  : {len(_groq_clients)} Groq key(s) + {len(_gemini_clients)} Gemini key(s)")
    print("Routes    : GET /health  POST /embed  POST /batch-embed")
    print("            POST /embed-sections  POST /llm-score")
    print("=" * 65)
    app.run(host="0.0.0.0", port=5001, debug=False)
