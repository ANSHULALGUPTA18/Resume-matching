import axios from 'axios';
import { SectionEmbeddings } from '../models/Job';

const EMBEDDING_SERVER_URL = process.env.EMBEDDING_SERVER_URL || 'http://localhost:5001';

// Section weights for the final semantic score
const SECTION_WEIGHTS: Record<keyof SectionEmbeddings, number> = {
  skills:     0.40,
  experience: 0.30,
  education:  0.15,
  summary:    0.15,
};

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

// ── LLM scoring (via Ollama on embedding server) ───────────────────────────────

export interface LlmScoreResult {
  skillMatch: number;
  experienceRelevance: number;
  educationFit: number;
  overallRecommendation: number;
  keyStrengths: string[];
  keyGaps: string[];
}

export async function llmScore(jdText: string, resumeText: string): Promise<LlmScoreResult> {
  try {
    const response = await axios.post(`${EMBEDDING_SERVER_URL}/llm-score`, {
      jd_text: jdText,
      resume_text: resumeText,
    }, { timeout: 180000 });

    const d = response.data;
    return {
      skillMatch:            d.skill_match ?? 50,
      experienceRelevance:   d.experience_relevance ?? 50,
      educationFit:          d.education_fit ?? 50,
      overallRecommendation: d.overall_recommendation ?? 50,
      keyStrengths:          d.key_strengths ?? [],
      keyGaps:               d.key_gaps ?? [],
    };
  } catch (error: any) {
    if (error.response?.status === 503) {
      throw new Error('Ollama not available. Install from https://ollama.ai then run: ollama pull mistral');
    }
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Embedding server not running. Start it with: python embedding_server.py');
    }
    throw error;
  }
}

export default { generateEmbedding, generateSectionEmbeddings, cosineSimilarity, scoreFromEmbeddings, scoreFromSectionEmbeddings, llmScore };
