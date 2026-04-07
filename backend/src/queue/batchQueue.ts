import PgBoss from 'pg-boss';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface ResumeJobData {
  batchId: string;
  jobId: string;
  filePath: string;
  fileName: string;
}

export const QUEUE_NAME = 'resume-processing';

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      retentionDays: 3,
    });
    boss.on('error', (err: Error) => console.error('pg-boss error:', err.message));
    await boss.start();
    console.log('pg-boss: started (PostgreSQL-backed queue, no Redis needed)');
  }
  return boss;
}
