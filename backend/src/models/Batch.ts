import pool from '../db';
import { randomUUID } from 'crypto';

export interface BatchStatus {
  id: string;
  jobId: string;
  totalCount: number;
  doneCount: number;
  failedCount: number;
  status: 'processing' | 'complete' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const Batch = {
  async create(jobId: string, totalCount: number): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO batches (id, job_id, total_count, done_count, failed_count, status, created_at, updated_at)
       VALUES ($1, $2, $3, 0, 0, 'processing', NOW(), NOW())`,
      [id, jobId, totalCount]
    );
    return id;
  },

  async getBatch(batchId: string): Promise<BatchStatus | null> {
    const result = await pool.query(
      'SELECT * FROM batches WHERE id = $1',
      [batchId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      id:           row.id,
      jobId:        row.job_id,
      totalCount:   row.total_count,
      doneCount:    row.done_count,
      failedCount:  row.failed_count,
      status:       row.status,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
    };
  },

  async incrementDone(batchId: string): Promise<void> {
    await pool.query(
      `UPDATE batches
       SET done_count = done_count + 1,
           status = CASE WHEN done_count + 1 + failed_count >= total_count THEN 'complete' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [batchId]
    );
  },

  async incrementFailed(batchId: string): Promise<void> {
    await pool.query(
      `UPDATE batches
       SET failed_count = failed_count + 1,
           status = CASE WHEN done_count + failed_count + 1 >= total_count THEN 'complete' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [batchId]
    );
  },

  // Returns candidates for a batch ordered by score, offset by how many we've already sent.
  // fromCache = true when the candidate existed before this batch (dedup/cache hit).
  async getRecentCandidates(batchId: string, offset: number): Promise<any[]> {
    const result = await pool.query(
      `SELECT c.id, c.job_id, c.batch_id, c.personal_info, c.score, c.status, c.file_name,
              c.score_breakdown, c.llm_feedback, c.extracted_data, c.created_at,
              (c.created_at < b.created_at) AS from_cache
       FROM candidates c
       JOIN batches b ON b.id = c.batch_id
       WHERE c.batch_id = $1
       ORDER BY c.created_at ASC
       OFFSET $2`,
      [batchId, offset]
    );
    return result.rows.map((row: any) => ({
      _id:            row.id,
      jobId:          row.job_id,
      batchId:        row.batch_id,
      personalInfo:   row.personal_info,
      score:          row.score,
      status:         row.status,
      fileName:       row.file_name,
      scoreBreakdown: row.score_breakdown,
      llmFeedback:    row.llm_feedback,
      extractedData:  row.extracted_data,
      createdAt:      row.created_at,
      fromCache:      row.from_cache ?? false,
    }));
  },
};

export default Batch;
