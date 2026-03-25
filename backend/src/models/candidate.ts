import { randomUUID } from 'crypto';
import pool from '../db';
import { SectionEmbeddings } from './Job';

export interface ExtractedData {
  yearsOfExperience: number | null;
  educationLevel: 'none' | 'associate' | 'bachelor' | 'master' | 'phd';
  skillsList: string[];
  jobTitles: string[];
}

export interface ScoreBreakdown {
  hardFilterPassed: boolean;
  hardFilterReason?: string;
  skillMatchScore: number;
  sectionSemanticScore: number | null;
  llmScore: number | null;
  finalScore: number;
  experiencePenalty?: number;
  educationPenalty?: number;
}

export interface LlmFeedback {
  keyStrengths: string[];
  keyGaps: string[];
  overallRecommendation: number;
}

export interface ICandidate {
  _id: string;
  jobId: string;
  personalInfo: { name: string; email: string; phone: string; location: string };
  experience: Array<{ title: string; company: string; duration: string; description: string }>;
  education: Array<{ degree: string; institution: string; year: string }>;
  skills: string[];
  certifications: string[];
  score: {
    overall: number;
    skillMatch: number;
    experienceMatch: number;
    educationMatch: number;
    keywordMatch: number;
  };
  improvements: string[];
  status: 'new' | 'shortlisted' | 'hold' | 'rejected';
  resumePath: string;
  rawText: string;
  fileName: string;
  embedding?: number[];
  semanticScore?: number;
  extractedData?: ExtractedData;
  sectionEmbeddings?: SectionEmbeddings;
  scoreBreakdown?: ScoreBreakdown;
  llmFeedback?: LlmFeedback;
  createdAt: Date;
  updatedAt: Date;
}

type CandidateUpdate = {
  embedding?: number[] | null;
  semanticScore?: number;
  score?: ICandidate['score'];
  improvements?: string[];
  status?: ICandidate['status'];
  extractedData?: ExtractedData | null;
  sectionEmbeddings?: SectionEmbeddings | null;
  scoreBreakdown?: ScoreBreakdown | null;
  llmFeedback?: LlmFeedback | null;
};

function rowToCandidate(row: any, includeEmbedding = false): ICandidate {
  const c: ICandidate = {
    _id: row.id, jobId: row.job_id,
    personalInfo: row.personal_info,
    experience: row.experience,
    education: row.education,
    skills: row.skills,
    certifications: row.certifications,
    score: row.score,
    improvements: row.improvements,
    status: row.status,
    resumePath: row.resume_path,
    rawText: row.raw_text,
    fileName: row.file_name,
    semanticScore: row.semantic_score ?? undefined,
    extractedData: row.extracted_data ?? undefined,
    sectionEmbeddings: includeEmbedding ? (row.section_embeddings ?? undefined) : undefined,
    scoreBreakdown: row.score_breakdown ?? undefined,
    llmFeedback: row.llm_feedback ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeEmbedding) c.embedding = row.embedding ?? undefined;
  return c;
}

export async function create(data: Omit<ICandidate, '_id' | 'createdAt' | 'updatedAt'>): Promise<ICandidate> {
  const id = randomUUID();
  const result = await pool.query(
    `INSERT INTO candidates
       (id, job_id, personal_info, experience, education, skills, certifications,
        score, improvements, status, resume_path, raw_text, file_name,
        embedding, semantic_score, extracted_data, section_embeddings, score_breakdown, llm_feedback)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      id, data.jobId,
      JSON.stringify(data.personalInfo || {}),
      JSON.stringify(data.experience || []),
      JSON.stringify(data.education || []),
      JSON.stringify(data.skills || []),
      JSON.stringify(data.certifications || []),
      JSON.stringify(data.score),
      JSON.stringify(data.improvements || []),
      data.status || 'new',
      data.resumePath || null, data.rawText || null, data.fileName || null,
      data.embedding ? JSON.stringify(data.embedding) : null,
      data.semanticScore ?? null,
      data.extractedData ? JSON.stringify(data.extractedData) : null,
      data.sectionEmbeddings ? JSON.stringify(data.sectionEmbeddings) : null,
      data.scoreBreakdown ? JSON.stringify(data.scoreBreakdown) : null,
      data.llmFeedback ? JSON.stringify(data.llmFeedback) : null,
    ]
  );
  return rowToCandidate(result.rows[0]);
}

export async function findById(id: string, includeEmbedding = false): Promise<ICandidate | null> {
  const result = await pool.query('SELECT * FROM candidates WHERE id = $1', [id]);
  if (!result.rows[0]) return null;
  return rowToCandidate(result.rows[0], includeEmbedding);
}

export async function findByJobId(jobId: string, includeEmbedding = false): Promise<ICandidate[]> {
  const result = await pool.query(
    `SELECT * FROM candidates WHERE job_id = $1 ORDER BY (score->>'overall')::float DESC`,
    [jobId]
  );
  return result.rows.map(row => rowToCandidate(row, includeEmbedding));
}

export async function update(id: string, data: CandidateUpdate): Promise<ICandidate | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const jsonFields: Array<[keyof CandidateUpdate, string]> = [
    ['score', 'score'], ['improvements', 'improvements'],
    ['extractedData', 'extracted_data'], ['sectionEmbeddings', 'section_embeddings'],
    ['scoreBreakdown', 'score_breakdown'], ['llmFeedback', 'llm_feedback'],
  ];

  for (const [key, col] of jsonFields) {
    if (key in data) {
      fields.push(`${col} = $${idx++}`);
      values.push((data as any)[key] != null ? JSON.stringify((data as any)[key]) : null);
    }
  }

  if ('embedding' in data) {
    fields.push(`embedding = $${idx++}`);
    values.push(data.embedding ? JSON.stringify(data.embedding) : null);
  }
  if ('semanticScore' in data) {
    fields.push(`semantic_score = $${idx++}`);
    values.push(data.semanticScore ?? null);
  }
  if ('status' in data) {
    fields.push(`status = $${idx++}`);
    values.push(data.status);
  }

  if (!fields.length) return findById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE candidates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!result.rows[0]) return null;
  return rowToCandidate(result.rows[0], 'embedding' in data);
}

export async function findByIdAndUpdate(id: string, data: CandidateUpdate): Promise<ICandidate | null> {
  return update(id, data);
}

export async function deleteByJobId(jobId: string): Promise<number> {
  const result = await pool.query('DELETE FROM candidates WHERE job_id = $1', [jobId]);
  return result.rowCount ?? 0;
}

const Candidate = { create, findById, findByJobId, update, findByIdAndUpdate, deleteByJobId };
export default Candidate;
