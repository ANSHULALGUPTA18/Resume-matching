/**
 * Redis Cache Service
 *
 * Two cache layers:
 *  1. Score cache  — key: score:{resume_hash}:{job_id}
 *                    value: full candidate score + breakdown + LLM feedback
 *                    TTL: 30 days
 *                    Supports 10,000+ entries at ~2–3 KB each (~25 MB total)
 *
 *  2. Embedding cache — key: embedding:{resume_hash}
 *                       value: section embeddings (384-dim × 4 sections)
 *                       TTL: 7 days
 *                       Same resume on a different JD reuses embeddings — no Flask call needed
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const SCORE_TTL_SECONDS     = 30 * 24 * 60 * 60; // 30 days
const EMBEDDING_TTL_SECONDS =  7 * 24 * 60 * 60; // 7 days

let client: Redis | null = null;
let redisAvailable = false;

function getClient(): Redis | null {
  if (client) return client;

  try {
    // Use host/port object — URL format (redis://) causes ECONNREFUSED on Windows→WSL
    client = new Redis({
      host:                 '127.0.0.1',
      port:                 6379,
      lazyConnect:          true,
      enableOfflineQueue:   false,
      maxRetriesPerRequest: 1,
      connectTimeout:       2000,
      commandTimeout:       2000,
    });

    client.on('connect', () => {
      redisAvailable = true;
      console.log('Redis connected — score/embedding cache active');
    });

    client.on('error', (err) => {
      if (redisAvailable) {
        console.warn('Redis error — falling back to DB-only mode:', err.message);
      }
      redisAvailable = false;
    });

    client.on('close', () => { redisAvailable = false; });

    client.connect().catch(() => { redisAvailable = false; });
  } catch {
    redisAvailable = false;
  }

  return client;
}

// ── Score cache ────────────────────────────────────────────────────────────────

export async function getCachedScore(resumeHash: string, jobId: string): Promise<any | null> {
  try {
    const redis = getClient();
    if (!redis || !redisAvailable) return null;
    const raw = await redis.get(`score:${resumeHash}:${jobId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedScore(
  resumeHash: string,
  jobId: string,
  data: {
    score: any;
    scoreBreakdown: any;
    llmFeedback?: any;
    extractedData?: any;
  }
): Promise<void> {
  try {
    const redis = getClient();
    if (!redis || !redisAvailable) return;
    await redis.setex(
      `score:${resumeHash}:${jobId}`,
      SCORE_TTL_SECONDS,
      JSON.stringify(data)
    );
  } catch {
    // Redis write failure is non-fatal — DB is the source of truth
  }
}

// ── Embedding cache ────────────────────────────────────────────────────────────

export async function getCachedEmbeddings(resumeHash: string): Promise<any | null> {
  try {
    const redis = getClient();
    if (!redis || !redisAvailable) return null;
    const raw = await redis.get(`embedding:${resumeHash}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedEmbeddings(resumeHash: string, embeddings: any): Promise<void> {
  try {
    const redis = getClient();
    if (!redis || !redisAvailable) return;
    await redis.setex(
      `embedding:${resumeHash}`,
      EMBEDDING_TTL_SECONDS,
      JSON.stringify(embeddings)
    );
  } catch {}
}

// ── Stats / diagnostics ────────────────────────────────────────────────────────

export async function getCacheStats(): Promise<{
  available: boolean;
  scoreKeys: number;
  embeddingKeys: number;
  memoryUsedMB: number;
}> {
  try {
    const redis = getClient();
    if (!redis || !redisAvailable) {
      return { available: false, scoreKeys: 0, embeddingKeys: 0, memoryUsedMB: 0 };
    }

    const [scoreKeys, embeddingKeys, info] = await Promise.all([
      redis.keys('score:*').then(k => k.length),
      redis.keys('embedding:*').then(k => k.length),
      redis.info('memory'),
    ]);

    const memMatch = info.match(/used_memory:(\d+)/);
    const memoryUsedMB = memMatch ? Math.round(parseInt(memMatch[1]) / 1024 / 1024 * 10) / 10 : 0;

    return { available: true, scoreKeys, embeddingKeys, memoryUsedMB };
  } catch {
    return { available: false, scoreKeys: 0, embeddingKeys: 0, memoryUsedMB: 0 };
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const redis = getClient();
    if (!redis || !redisAvailable) return;
    await redis.flushdb();
    console.log('Redis cache cleared');
  } catch {}
}

// Initialise connection on module load
getClient();

export default { getCachedScore, setCachedScore, getCachedEmbeddings, setCachedEmbeddings, getCacheStats, clearAllCache };
