import axios from 'axios';

const EMBEDDING_SERVER_URL = process.env.EMBEDDING_SERVER_URL || 'http://localhost:5001';

/**
 * Generate embedding using local BGE-large model
 * @param text - Text to embed
 * @param type - 'query' for job descriptions, 'passage' for resumes
 * @returns 1024-dimensional embedding vector
 */
export async function generateEmbedding(text: string, type: 'query' | 'passage' = 'passage'): Promise<number[]> {
  try {
    const response = await axios.post(`${EMBEDDING_SERVER_URL}/embed`, {
      text: text.slice(0, 10000),
      type: type
    }, {
      timeout: 30000 // 30 second timeout
    });
    
    const embedding = response.data.embedding;
    
    // Validate dimension (should be 1024 for BGE-large)
    if (embedding.length !== 1024) {
      console.warn(`Unexpected embedding dimension: ${embedding.length}, expected 1024`);
    }
    
    return embedding;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Local embedding server is not running. Please start it with: python embedding_server.py');
    }
    throw error;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  // CRITICAL: Validate dimension match to prevent errors with old embeddings
  if (a.length !== b.length) {
    console.error(`Dimension mismatch: vector A=${a.length}d, vector B=${b.length}d`);
    throw new Error(`Cannot compute similarity: dimension mismatch (${a.length} vs ${b.length})`);
  }
  
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function scoreFromEmbeddings(jobEmbedding: number[], candidateEmbedding: number[]): number {
  const similarity = cosineSimilarity(jobEmbedding, candidateEmbedding);
  return Math.min(100, Math.max(0, Math.round(similarity * 100)));
}

export default { generateEmbedding, cosineSimilarity, scoreFromEmbeddings };
