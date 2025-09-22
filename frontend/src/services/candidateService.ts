import api from './api';

export interface Candidate {
  _id: string;
  jobId: string;
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
  };
  skills: string[];
  score: {
    overall: number;
    skillMatch: number;
    experienceMatch: number;
    educationMatch: number;
    keywordMatch: number;
  };
  improvements: string[];
  status: 'new' | 'shortlisted' | 'hold' | 'rejected';
  fileName: string;
  createdAt: string;
}

export const candidateService = {
  uploadResumes: async (jobId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('resumes', file);
    });

    const response = await api.post(`/candidates/upload/${jobId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getCandidatesByJob: async (jobId: string) => {
    const response = await api.get(`/candidates/job/${jobId}`);
    return response.data;
  },

  updateStatus: async (candidateId: string, status: string) => {
    const response = await api.patch(`/candidates/${candidateId}/status`, { status });
    return response.data;
  },
};