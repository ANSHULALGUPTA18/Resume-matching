import pool from '../db';
import { randomUUID } from 'crypto';

// Type exports kept for backward-compat with scoringService imports
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
  matchedRequired?: string[];
  missingRequired?: string[];
  matchedPreferred?: string[];
  missingPreferred?: string[];
}

export interface LlmFeedback {
  keyStrengths: string[];
  keyGaps: string[];
  overallRecommendation: number;
}

export interface Candidate {
  _id: string;
  jobId: string;
  batchId?: string;
  personalInfo: { name: string; email: string; phone: string; location: string };
  experience: any[];
  education: any[];
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
  resumePath?: string;
  rawText?: string;
  fileName?: string;
  embedding?: number[];
  semanticScore?: number;
  extractedData?: any;
  sectionEmbeddings?: any;
  scoreBreakdown?: any;
  llmFeedback?: any;
  resumeHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): Candidate {
  return {
    _id:               row.id,
    jobId:             row.job_id,
    batchId:           row.batch_id ?? undefined,
    personalInfo:      row.personal_info   ?? { name: '', email: '', phone: '', location: '' },
    experience:        row.experience      ?? [],
    education:         row.education       ?? [],
    skills:            row.skills          ?? [],
    certifications:    row.certifications  ?? [],
    score:             row.score           ?? { overall: 0, skillMatch: 0, experienceMatch: 0, educationMatch: 0, keywordMatch: 0 },
    improvements:      row.improvements    ?? [],
    status:            row.status          ?? 'new',
    resumePath:        row.resume_path     ?? undefined,
    rawText:           row.raw_text        ?? undefined,
    fileName:          row.file_name       ?? undefined,
    embedding:         row.embedding       ?? undefined,
    semanticScore:     row.semantic_score  ?? undefined,
    extractedData:     row.extracted_data  ?? undefined,
    sectionEmbeddings: row.section_embeddings ?? undefined,
    scoreBreakdown:    row.score_breakdown  ?? undefined,
    llmFeedback:       row.llm_feedback     ?? undefined,
    resumeHash:        row.resume_hash      ?? undefined,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

const Candidate = {
  async create(data: Partial<Candidate> & Record<string, any>): Promise<Candidate> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO candidates
         (id, job_id, batch_id, personal_info, experience, education, skills, certifications,
          score, improvements, status, resume_path, raw_text, file_name,
          extracted_data, score_breakdown, llm_feedback, resume_hash,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, NOW(), NOW())
       RETURNING *`,
      [
        id,
        data.jobId,
        data.batchId ?? null,
        JSON.stringify(data.personalInfo ?? {}),
        JSON.stringify(data.experience   ?? []),
        JSON.stringify(data.education    ?? []),
        JSON.stringify(data.skills       ?? []),
        JSON.stringify(data.certifications ?? []),
        JSON.stringify(data.score        ?? { overall: 0, skillMatch: 0, experienceMatch: 0, educationMatch: 0, keywordMatch: 0 }),
        JSON.stringify(data.improvements ?? []),
        data.status      ?? 'new',
        data.resumePath  ?? null,
        data.rawText     ?? null,
        data.fileName    ?? null,
        data.extractedData  ? JSON.stringify(data.extractedData)  : null,
        data.scoreBreakdown ? JSON.stringify(data.scoreBreakdown) : null,
        data.llmFeedback    ? JSON.stringify(data.llmFeedback)    : null,
        data.resumeHash  ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  },

  async findById(id: string): Promise<Candidate | null> {
    const result = await pool.query(
      'SELECT * FROM candidates WHERE id = $1',
      [id]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  },

  async findByJobId(jobId: string, includeRawText = false): Promise<Candidate[]> {
    const cols = includeRawText ? '*' : `
      id, job_id, batch_id, personal_info, experience, education, skills,
      certifications, score, improvements, status, resume_path, file_name,
      extracted_data, section_embeddings, score_breakdown, llm_feedback,
      resume_hash, semantic_score, created_at, updated_at`;
    const result = await pool.query(
      `SELECT ${cols} FROM candidates WHERE job_id = $1 ORDER BY created_at ASC`,
      [jobId]
    );
    return result.rows.map(mapRow);
  },

  async findByHashAndJob(resumeHash: string, jobId: string): Promise<Candidate | null> {
    const result = await pool.query(
      'SELECT * FROM candidates WHERE resume_hash = $1 AND job_id = $2 LIMIT 1',
      [resumeHash, jobId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  },

  async update(id: string, data: Partial<Candidate>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.score !== undefined) {
      sets.push(`score = $${idx++}`);
      values.push(JSON.stringify(data.score));
    }
    if (data.scoreBreakdown !== undefined) {
      sets.push(`score_breakdown = $${idx++}`);
      values.push(JSON.stringify(data.scoreBreakdown));
    }
    if (data.llmFeedback !== undefined) {
      sets.push(`llm_feedback = $${idx++}`);
      values.push(JSON.stringify(data.llmFeedback));
    }
    if (data.sectionEmbeddings !== undefined) {
      sets.push(`section_embeddings = $${idx++}`);
      values.push(JSON.stringify(data.sectionEmbeddings));
    }
    if (data.improvements !== undefined) {
      sets.push(`improvements = $${idx++}`);
      values.push(JSON.stringify(data.improvements));
    }
    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (sets.length === 0) return;

    sets.push(`updated_at = NOW()`);
    values.push(id);
    await pool.query(
      `UPDATE candidates SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );
  },

  async findByIdAndUpdate(id: string, data: { status?: string }): Promise<Candidate | null> {
    if (!data.status) return this.findById(id);
    const result = await pool.query(
      `UPDATE candidates SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [data.status, id]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  },

  async linkToBatch(candidateId: string, batchId: string): Promise<void> {
    await pool.query(
      'UPDATE candidates SET batch_id = $1, updated_at = NOW() WHERE id = $2',
      [batchId, candidateId]
    );
  },

  async deleteByJobId(jobId: string): Promise<number> {
    const result = await pool.query(
      'DELETE FROM candidates WHERE job_id = $1',
      [jobId]
    );
    return result.rowCount ?? 0;
  },
};

export default Candidate;
