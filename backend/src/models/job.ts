import pool from '../db';
import { randomUUID } from 'crypto';

// Legacy type alias kept for backward-compat with scoringService / vectorService imports
export type IJob = Job;

export interface SectionEmbeddings {
  skills:     number[];
  experience: number[];
  education:  number[];
  summary:    number[];
}

export interface Job {
  _id: string;
  title: string;
  company: string;
  description: string;
  requirements: {
    skills: string[];
    experience: number;
    education: string[];
    certifications: string[];
    requiredSkills?: string[];
    preferredSkills?: string[];
  };
  keywords: string[];
  rawText?: string;
  fileName?: string;
  embedding?: number[];
  sectionEmbeddings?: any;
  jdHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): Job {
  return {
    _id:               row.id,
    title:             row.title,
    company:           row.company,
    description:       row.description,
    requirements:      row.requirements,
    keywords:          row.keywords ?? [],
    rawText:           row.raw_text   ?? undefined,
    fileName:          row.file_name  ?? undefined,
    embedding:         row.embedding  ?? undefined,
    sectionEmbeddings: row.section_embeddings ?? undefined,
    jdHash:            row.jd_hash    ?? undefined,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

const Job = {
  async findById(id: string, _includeEmbeddings = false): Promise<Job | null> {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  },

  async findAll(): Promise<Job[]> {
    const result = await pool.query(
      'SELECT * FROM jobs ORDER BY created_at DESC'
    );
    return result.rows.map(mapRow);
  },

  async findByHash(hash: string): Promise<Job | null> {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE jd_hash = $1 LIMIT 1',
      [hash]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  },

  async create(data: Partial<Job> & { jdHash?: string }): Promise<Job> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO jobs
         (id, title, company, description, requirements, keywords,
          raw_text, file_name, jd_hash, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW(), NOW())
       RETURNING *`,
      [
        id,
        data.title   ?? '',
        data.company ?? '',
        data.description ?? '',
        JSON.stringify(data.requirements ?? { skills: [], experience: 0, education: [], certifications: [] }),
        JSON.stringify(data.keywords ?? []),
        data.rawText  ?? null,
        data.fileName ?? null,
        data.jdHash   ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  },

  async update(id: string, data: Partial<Job>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.embedding !== undefined) {
      sets.push(`embedding = $${idx++}`);
      values.push(JSON.stringify(data.embedding));
    }
    if (data.sectionEmbeddings !== undefined) {
      sets.push(`section_embeddings = $${idx++}`);
      values.push(JSON.stringify(data.sectionEmbeddings));
    }
    if (data.title !== undefined) {
      sets.push(`title = $${idx++}`);
      values.push(data.title);
    }
    if (sets.length === 0) return;

    sets.push(`updated_at = NOW()`);
    values.push(id);
    await pool.query(
      `UPDATE jobs SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );
  },

  async clearAll(): Promise<void> {
    await pool.query('DELETE FROM candidates');
    await pool.query('DELETE FROM jobs');
    console.log('DB cleared: all candidates and jobs deleted');
  },
};

export default Job;
