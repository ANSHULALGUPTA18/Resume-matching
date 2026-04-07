import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export interface BatchUploadResponse {
  batchId: string;
  jobId: string;
  totalQueued: number;
}

export interface BatchStatus {
  id: string;
  jobId: string;
  totalCount: number;
  doneCount: number;
  failedCount: number;
  status: 'processing' | 'complete' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export const batchService = {
  // Upload all resumes at once — returns batchId immediately (< 1 second)
  uploadBatch: async (jobId: string, files: File[]): Promise<BatchUploadResponse> => {
    const formData = new FormData();
    formData.append('jobId', jobId);
    files.forEach(file => formData.append('resumes', file));
    const response = await axios.post(`${API_BASE_URL}/batch/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Poll progress snapshot (used as fallback if SSE fails)
  getStatus: async (batchId: string): Promise<BatchStatus> => {
    const response = await axios.get(`${API_BASE_URL}/batch/${batchId}/status`);
    return response.data;
  },

  // Returns the SSE URL (used by BatchProgress page via EventSource)
  progressUrl: (batchId: string): string =>
    `${API_BASE_URL}/batch/${batchId}/progress`,
};
