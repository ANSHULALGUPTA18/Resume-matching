import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export interface Job {
  _id: string;
  title: string;
  company: string;
  description?: string;
  requirements?: {
    skills: string[];
    experience: number;
    education: string[];
    certifications: string[];
  };
  keywords?: string[];
  createdAt: string;
}

export const jobService = {
  uploadJD: async (file: File, company?: string) => {
    const formData = new FormData();
    formData.append('jd', file);
    if (company) formData.append('company', company);

    try {
      const response = await axios.post(`${API_BASE_URL}/jobs/upload`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data' 
        },
      });
      return response.data;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  },

  importText: async (
    text: string,
    options?: { company?: string; title?: string; fileName?: string }
  ) => {
    const payload: Record<string, any> = { text };
    if (options?.company) payload.company = options.company;
    if (options?.title) payload.title = options.title;
    if (options?.fileName) payload.fileName = options.fileName;

    try {
      const response = await axios.post(`${API_BASE_URL}/jobs/import-text`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    } catch (error) {
      console.error('Import text error:', error);
      throw error;
    }
  },

  getAllJobs: async () => {
    const response = await axios.get(`${API_BASE_URL}/jobs`);
    return response.data;
  },

  getJob: async (id: string) => {
    const response = await axios.get(`${API_BASE_URL}/jobs/${id}`);
    return response.data;
  },
};