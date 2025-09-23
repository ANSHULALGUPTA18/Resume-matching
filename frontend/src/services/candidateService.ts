import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export interface Candidate {
  _id: string;
  jobId: string;
  personalInfo?: {
    name: string;
    email: string;
    phone: string;
    location: string;
  };
  skills?: string[];
  score?: {
    overall: number;
    skillMatch?: number;
    experienceMatch?: number;
    educationMatch?: number;
    keywordMatch?: number;
  };
  improvements?: string[];
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

    const response = await axios.post(`${API_BASE_URL}/candidates/upload/${jobId}`, formData, {
      headers: { 
        'Content-Type': 'multipart/form-data' 
      },
    });
    return response.data;
  },

  getCandidatesByJob: async (jobId: string) => {
    const response = await axios.get(`${API_BASE_URL}/candidates/job/${jobId}`);
    return response.data;
  },

  updateStatus: async (candidateId: string, status: string) => {
    const response = await axios.patch(`${API_BASE_URL}/candidates/${candidateId}/status`, { status });
    return response.data;
  },
};