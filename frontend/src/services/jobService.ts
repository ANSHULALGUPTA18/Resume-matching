import api from './api';

export interface Job {
  _id: string;
  title: string;
  company: string;
  description: string;
  requirements: {
    skills: string[];
    experience: number;
    education: string[];
    certifications: string[];
  };
  keywords: string[];
  createdAt: string;
}

export const jobService = {
  uploadJD: async (file: File, company?: string) => {
    const formData = new FormData();
    formData.append('jd', file);
    if (company) formData.append('company', company);

    const response = await api.post('/jobs/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getAllJobs: async () => {
    const response = await api.get('/jobs');
    return response.data;
  },

  getJob: async (id: string) => {
    const response = await api.get(`/jobs/${id}`);
    return response.data;
  },
};