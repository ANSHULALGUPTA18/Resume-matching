import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env BEFORE creating pool so DATABASE_URL is available
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Anshu@12345@localhost:5432/ats_resume_optimizer',
});

export const initDB = async (): Promise<void> => {
  // Create base tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      description TEXT NOT NULL,
      requirements JSONB NOT NULL DEFAULT '{"skills":[],"experience":0,"education":[],"certifications":[]}',
      keywords JSONB NOT NULL DEFAULT '[]',
      raw_text TEXT,
      file_name TEXT,
      embedding JSONB DEFAULT NULL,
      section_embeddings JSONB DEFAULT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id UUID PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      personal_info JSONB NOT NULL DEFAULT '{}',
      experience JSONB NOT NULL DEFAULT '[]',
      education JSONB NOT NULL DEFAULT '[]',
      skills JSONB NOT NULL DEFAULT '[]',
      certifications JSONB NOT NULL DEFAULT '[]',
      score JSONB NOT NULL DEFAULT '{"overall":0,"skillMatch":0,"experienceMatch":0,"educationMatch":0,"keywordMatch":0}',
      improvements JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new',
      resume_path TEXT,
      raw_text TEXT,
      file_name TEXT,
      embedding JSONB DEFAULT NULL,
      semantic_score FLOAT,
      extracted_data JSONB DEFAULT NULL,
      section_embeddings JSONB DEFAULT NULL,
      score_breakdown JSONB DEFAULT NULL,
      llm_feedback JSONB DEFAULT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Batches table — tracks async bulk upload jobs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS batches (
      id UUID PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      total_count INTEGER NOT NULL DEFAULT 0,
      done_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'processing',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Add new columns to existing tables (safe for already-deployed DBs)
  const alterStatements = [
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS section_embeddings JSONB DEFAULT NULL`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_hash TEXT`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT NULL`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS section_embeddings JSONB DEFAULT NULL`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT NULL`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS llm_feedback JSONB DEFAULT NULL`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_hash TEXT`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id)`,
    // Prevent same resume being stored twice for the same job (dedup key)
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'candidates_resume_hash_job_id_uq'
       ) THEN
         ALTER TABLE candidates ADD CONSTRAINT candidates_resume_hash_job_id_uq UNIQUE (resume_hash, job_id);
       END IF;
     END $$`,
  ];

  for (const sql of alterStatements) {
    await pool.query(sql);
  }
};

export default pool;
