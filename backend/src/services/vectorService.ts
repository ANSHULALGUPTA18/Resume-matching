import axios from 'axios';
import OpenAI from 'openai';
import { SectionEmbeddings } from '../models/Job';

const EMBEDDING_SERVER_URL = process.env.EMBEDDING_SERVER_URL || 'http://localhost:5001';

// Section weights for the final semantic score
const SECTION_WEIGHTS: Record<keyof SectionEmbeddings, number> = {
  skills:     0.40,
  experience: 0.30,
  education:  0.15,
  summary:    0.15,
};

// ── Groq client (OpenAI-compatible) ────────────────────────────────────────────

function getGroqClient(): OpenAI {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set in environment variables');
  return new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
}

// ── Single embedding ───────────────────────────────────────────────────────────

export async function generateEmbedding(text: string, type: 'query' | 'passage' = 'passage'): Promise<number[]> {
  try {
    const response = await axios.post(`${EMBEDDING_SERVER_URL}/embed`, {
      text: text.slice(0, 12000), type
    }, { timeout: 30000 });

    const embedding = response.data.embedding;
    if (![384, 768, 1024].includes(embedding.length)) {
      console.warn(`Unexpected embedding dimension: ${embedding.length}`);
    }
    return embedding;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Embedding server not running. Start it with: python embedding_server.py');
    }
    throw error;
  }
}

// ── Section embeddings ─────────────────────────────────────────────────────────

export async function generateSectionEmbeddings(
  text: string,
  type: 'query' | 'passage' = 'passage'
): Promise<SectionEmbeddings> {
  try {
    const response = await axios.post(`${EMBEDDING_SERVER_URL}/embed-sections`, {
      text: text.slice(0, 12000), type
    }, { timeout: 60000 });

    return response.data.embeddings as SectionEmbeddings;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Embedding server not running. Start it with: python embedding_server.py');
    }
    throw error;
  }
}

// ── Similarity math ────────────────────────────────────────────────────────────

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

export function scoreFromEmbeddings(jobEmbedding: number[], candidateEmbedding: number[]): number {
  const sim = cosineSimilarity(jobEmbedding, candidateEmbedding);
  return Math.min(100, Math.max(0, Math.round(sim * 100)));
}

// ── Section-level score ────────────────────────────────────────────────────────

export function scoreFromSectionEmbeddings(
  jobSections: SectionEmbeddings,
  candidateSections: SectionEmbeddings
): number {
  let total = 0;
  for (const [section, weight] of Object.entries(SECTION_WEIGHTS) as [keyof SectionEmbeddings, number][]) {
    const jobEmb = jobSections[section];
    const resEmb = candidateSections[section];
    if (!jobEmb?.length || !resEmb?.length) continue;
    if (jobEmb.length !== resEmb.length) {
      console.warn(`Section "${section}" dimension mismatch — skipping`);
      continue;
    }
    const sim = cosineSimilarity(jobEmb, resEmb);
    total += sim * weight;
  }
  return Math.min(100, Math.max(0, Math.round(total * 100)));
}

// ── LLM scoring via Groq — Llama 3.3 70B ──────────────────────────────────────

export interface LlmScoreResult {
  skillMatch: number;
  experienceRelevance: number;
  educationFit: number;
  overallRecommendation: number;
  keyStrengths: string[];
  keyGaps: string[];
}

const GROQ_SYSTEM_PROMPT =
  'You are an expert ATS (Applicant Tracking System) evaluator. ' +
  'Respond ONLY with a valid JSON object — no markdown, no explanation, no extra text.';

const GROQ_USER_TEMPLATE = (jd: string, resume: string) => `\
Evaluate how well the RESUME matches the JOB DESCRIPTION.
Score each dimension 0–100 (100 = perfect match).

JOB DESCRIPTION:
${jd}

RESUME:
${resume}

Respond with this exact JSON schema:
{
  "skill_match": <0-100>,
  "experience_relevance": <0-100>,
  "education_fit": <0-100>,
  "overall_recommendation": <0-100>,
  "key_strengths": ["strength1", "strength2", "strength3"],
  "key_gaps": ["gap1", "gap2", "gap3"]
}`;

function clamp(val: unknown, scale: number, fallback = 50): number {
  const n = Number(val);
  return isNaN(n) ? fallback : Math.min(100, Math.max(0, Math.round(n * scale)));
}

// Groq sometimes returns 0-1 range instead of 0-100 — detect and normalise
function detectScale(d: Record<string, unknown>): number {
  const scores = [d.skill_match, d.experience_relevance, d.education_fit, d.overall_recommendation]
    .map(Number).filter(n => !isNaN(n));
  if (scores.length === 0) return 1;
  const allNormalised = scores.every(n => n >= 0 && n <= 1);
  return allNormalised ? 100 : 1;
}

function parseGroqJson(content: string): Record<string, unknown> {
  // Try direct parse
  try { return JSON.parse(content.trim()); } catch {}
  // Strip markdown code fences
  const stripped = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // Extract first {...} block
  const m = stripped.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return {};
}

export async function llmScore(jdText: string, resumeText: string): Promise<LlmScoreResult> {
  const groq = getGroqClient();

  const completion = await groq.chat.completions.create(
    {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: GROQ_SYSTEM_PROMPT },
        { role: 'user',   content: GROQ_USER_TEMPLATE(jdText.slice(0, 3000), resumeText.slice(0, 3000)) },
      ],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    },
    { timeout: 30000 }
  );

  const raw = completion.choices[0]?.message?.content ?? '';
  const d = parseGroqJson(raw);
  const scale = detectScale(d);

  return {
    skillMatch:            clamp(d.skill_match,            scale),
    experienceRelevance:   clamp(d.experience_relevance,   scale),
    educationFit:          clamp(d.education_fit,          scale),
    overallRecommendation: clamp(d.overall_recommendation, scale),
    keyStrengths:          Array.isArray(d.key_strengths) ? d.key_strengths as string[] : [],
    keyGaps:               Array.isArray(d.key_gaps)      ? d.key_gaps      as string[] : [],
  };
}

export default { generateEmbedding, generateSectionEmbeddings, cosineSimilarity, scoreFromEmbeddings, scoreFromSectionEmbeddings, llmScore };
