"""
Local Embedding Server — BGE-large-en-v1.5 + Section Embeddings + Ollama LLM Scoring
Endpoints:
  GET  /health           — status + Ollama availability
  POST /embed            — single 1024-dim embedding
  POST /batch-embed      — batch 1024-dim embeddings
  POST /embed-sections   — section-level embeddings (skills/experience/education/summary)
  POST /llm-score        — Mistral 7B re-ranking via Ollama
"""

import re
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
CORS(app)

OLLAMA_URL = "http://localhost:11434"

# Try models in order of availability; BGE models are optional upgrades.
# MiniLM is listed first because it is already downloaded and guaranteed to work.
# To upgrade: pip install sentence-transformers && python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')"
_CANDIDATE_MODELS = [
    "all-MiniLM-L6-v2",         # 384-dim, already installed — always works
    "BAAI/bge-small-en-v1.5",   # 384-dim, upgrade option
    "BAAI/bge-base-en-v1.5",    # 768-dim, better quality
    "BAAI/bge-large-en-v1.5",   # 1024-dim, best quality
]

model = None
MODEL_NAME = None
for _name in _CANDIDATE_MODELS:
    try:
        print(f"Trying model: {_name} ...")
        _m = SentenceTransformer(_name)
        _d = _m.get_sentence_embedding_dimension()
        # Quick sanity check
        _m.encode("test", normalize_embeddings=True)
        model = _m
        MODEL_NAME = _name
        print(f"Model loaded: {MODEL_NAME}  ({_d}-dim)")
        break
    except Exception as _e:
        print(f"  Failed ({_e}), trying next ...")

if model is None:
    raise RuntimeError("No embedding model could be loaded")

DIM = model.get_sentence_embedding_dimension()


# ── Prefix helpers (BGE-large requires task-specific prefixes) ─────────────────

def add_prefix(text: str, text_type: str) -> str:
    if text_type == "query":
        return "Represent this sentence for searching relevant passages: " + text
    return text  # passage — no prefix needed for BGE-large


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

# Order in which we try to assign section content
SECTION_ORDER = ["summary", "skills", "experience", "education"]


def split_into_sections(text: str) -> dict:
    """
    Split document text into named sections.
    Returns a dict with keys: skills, experience, education, summary.
    Each value is a (possibly empty) string.
    """
    lines = text.split("\n")
    sections = {k: [] for k in SECTION_ORDER}
    current_section = "summary"  # default bucket

    for line in lines:
        stripped = line.strip()
        # Check if this line is a section header
        matched_section = None
        for sec, pattern in SECTION_PATTERNS.items():
            # Header: short line (≤60 chars) that matches the pattern
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
        # Fallback: if a section is empty, use a small slice of the full text
        result[sec] = content if content else ""

    # If summary is empty, use first 500 chars of full text
    if not result["summary"]:
        result["summary"] = text[:500]

    # If skills is empty, use keyword scan
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

    return jsonify({
        "status": "healthy",
        "model": MODEL_NAME,
        "dimension": DIM,
        "ollama_available": ollama_ok,
        "ollama_models": ollama_models,
    })


# ── Single embed ───────────────────────────────────────────────────────────────

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
        "model": MODEL_NAME,
        "type": text_type,
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
    prefixed = [add_prefix(str(t)[:12000], text_type) for t in texts]
    embeddings = model.encode(prefixed, convert_to_tensor=False, normalize_embeddings=True)

    return jsonify({
        "embeddings": [e.tolist() for e in embeddings],
        "count": len(embeddings),
        "dimension": DIM,
        "model": MODEL_NAME,
    })


# ── Section embeddings ─────────────────────────────────────────────────────────

@app.route("/embed-sections", methods=["POST"])
def embed_sections():
    """
    Split text into sections and embed each one separately.
    Returns: { embeddings: { skills, experience, education, summary } }
    """
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": 'Missing "text" field'}), 400

    text = str(data["text"])[:12000]
    text_type = data.get("type", "passage")

    sections = split_into_sections(text)

    result = {}
    for sec, content in sections.items():
        if content.strip():
            prefixed = add_prefix(content[:4000], text_type)
            emb = model.encode(prefixed, convert_to_tensor=False, normalize_embeddings=True)
            result[sec] = emb.tolist()
        else:
            result[sec] = []

    return jsonify({"embeddings": result, "model": MODEL_NAME, "dimension": DIM})


# ── LLM scoring via Ollama ─────────────────────────────────────────────────────

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


def call_ollama(prompt: str, model_name: str = "mistral") -> str:
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": model_name, "prompt": prompt, "stream": False, "format": "json"},
        timeout=180,
    )
    response.raise_for_status()
    return response.json().get("response", "")


def extract_json(text: str) -> dict:
    """Extract the first JSON object found in the text."""
    # Try direct parse first
    try:
        return json.loads(text.strip())
    except Exception:
        pass
    # Find JSON block
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return {}


@app.route("/llm-score", methods=["POST"])
def llm_score():
    data = request.get_json()
    if not data or "jd_text" not in data or "resume_text" not in data:
        return jsonify({"error": 'Missing "jd_text" or "resume_text"'}), 400

    jd_text = str(data["jd_text"])[:4000]
    resume_text = str(data["resume_text"])[:4000]
    llm_model = data.get("model", "mistral")

    # Check Ollama availability
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if r.status_code != 200:
            return jsonify({"error": "Ollama not available"}), 503
    except Exception:
        return jsonify({"error": "Ollama not running. Install from https://ollama.ai and run: ollama pull mistral"}), 503

    prompt = LLM_PROMPT_TEMPLATE.format(jd_text=jd_text, resume_text=resume_text)

    try:
        raw = call_ollama(prompt, llm_model)
    except requests.exceptions.HTTPError as e:
        if e.response and e.response.status_code == 404:
            return jsonify({"error": f"Model '{llm_model}' not found. Run: ollama pull {llm_model}"}), 503
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    parsed = extract_json(raw)

    # Validate and clamp scores
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
    })


if __name__ == "__main__":
    print("=" * 65)
    print("ATS Resume Optimizer — Embedding Server")
    print(f"Model  : {MODEL_NAME}  ({DIM}-dim)")
    print("Routes : GET /health  POST /embed  POST /batch-embed")
    print("         POST /embed-sections  POST /llm-score")
    print("=" * 65)
    app.run(host="0.0.0.0", port=5001, debug=False)
