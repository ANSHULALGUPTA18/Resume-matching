import { randomUUID } from 'crypto';
import pool from '../db';

export interface SectionEmbeddings {
  skills: number[];
  experience: number[];
  education: number[];
  summary: number[];
}

export interface IJob {
  _id: string;
  title: string;
  company: string;
  description: string;
  requirements: {
    skills: string[];
    requiredSkills?: string[];
    preferredSkills?: string[];
    experience: number;
    education: string[];
    certifications: string[];
  };
  keywords: string[];
  rawText: string;
  fileName: string;
  embedding?: number[];
  sectionEmbeddings?: SectionEmbeddings;
  jdHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

function rowToJob(row: any, includeEmbedding = false): IJob {
  const job: IJob = {
    _id: row.id,
    title: row.title,
    company: row.company,
    description: row.description,
    requirements: row.requirements,
    keywords: row.keywords,
    rawText: row.raw_text,
    fileName: row.file_name,
    jdHash: row.jd_hash ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeEmbedding) {
    job.embedding = row.embedding ?? undefined;
    job.sectionEmbeddings = row.section_embeddings ?? undefined;
  }
  return job;
}

export async function create(data: Omit<IJob, '_id' | 'createdAt' | 'updatedAt'>): Promise<IJob> {
  const id = randomUUID();
  const result = await pool.query(
    `INSERT INTO jobs (id, title, company, description, requirements, keywords, raw_text, file_name, embedding, section_embeddings, jd_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      id, data.title, data.company, data.description,
      JSON.stringify(data.requirements),
      JSON.stringify(data.keywords || []),
      data.rawText || null, data.fileName || null,
      data.embedding ? JSON.stringify(data.embedding) : null,
      data.sectionEmbeddings ? JSON.stringify(data.sectionEmbeddings) : null,
      data.jdHash ?? null,
    ]
  );
  return rowToJob(result.rows[0], !!data.embedding);
}

export async function findByHash(hash: string): Promise<IJob | null> {
  const result = await pool.query(
    'SELECT * FROM jobs WHERE jd_hash = $1 ORDER BY created_at DESC LIMIT 1',
    [hash]
  );
  if (!result.rows[0]) return null;
  return rowToJob(result.rows[0]);
}

export async function findById(id: string, includeEmbedding = false): Promise<IJob | null> {
  const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
  if (!result.rows[0]) return null;
  return rowToJob(result.rows[0], includeEmbedding);
}

export async function findAll(): Promise<IJob[]> {
  const result = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
  return result.rows.map(row => rowToJob(row));
}

export async function update(
  id: string,
  data: { embedding?: number[] | null; sectionEmbeddings?: SectionEmbeddings | null }
): Promise<IJob | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if ('embedding' in data) {
    fields.push(`embedding = $${idx++}`);
    values.push(data.embedding ? JSON.stringify(data.embedding) : null);
  }
  if ('sectionEmbeddings' in data) {
    fields.push(`section_embeddings = $${idx++}`);
    values.push(data.sectionEmbeddings ? JSON.stringify(data.sectionEmbeddings) : null);
  }

  if (!fields.length) return findById(id, true);

  fields.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE jobs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!result.rows[0]) return null;
  return rowToJob(result.rows[0], true);
}

export async function clearAll(): Promise<void> {
  // DELETE instead of TRUNCATE — avoids permission issues and works with UUID PKs
  await pool.query('DELETE FROM candidates');
  await pool.query('DELETE FROM jobs');
  console.log('DB cleared: all candidates and jobs deleted');
}

const Job = { create, findById, findAll, findByHash, update, clearAll };
export default Job;
