import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export interface ExtractedData {
  yearsOfExperience: number | null;
  educationLevel: 'none' | 'associate' | 'bachelor' | 'master' | 'phd';
  skillsList: string[];
  jobTitles: string[];
}

export interface ScoreBreakdown {
  hardFilterPassed: boolean;
  hardFilterReason?: string;
  skillMatchScore: number;
  sectionSemanticScore: number | null;
  llmScore: number | null;
  finalScore: number;
  experiencePenalty?: number;
  educationPenalty?: number;
  matchedRequired?: string[];
  missingRequired?: string[];
  matchedPreferred?: string[];
  missingPreferred?: string[];
}

export interface LlmFeedback {
  keyStrengths: string[];
  keyGaps: string[];
  overallRecommendation: number;
}

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
  semanticScore?: number;
  extractedData?: ExtractedData;
  fileName: string;
  resumePath?: string;
  scoreBreakdown?: ScoreBreakdown;
  llmFeedback?: LlmFeedback;
  isDuplicate?: boolean;
  createdAt: string;
}

export const candidateService = {
  uploadResume: async (jobId: string, file: File) => {
    const formData = new FormData();
    formData.append('resumes', file);
    const response = await axios.post(`${API_BASE_URL}/candidates/upload/${jobId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

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

  deleteByJob: async (jobId: string) => {
    const response = await axios.delete(`${API_BASE_URL}/candidates/job/${jobId}`);
    return response.data;
  },
};