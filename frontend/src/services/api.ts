import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interview Prep API
export const generateInterviewPrep = async (jobDescription: string, resumeText: string) => {
  try {
    const response = await api.post('/interview-prep', {
      jobDescription,
      resumeText,
    });
    return response.data.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to generate interview questions');
  }
};

// Remove the auth interceptor for now since we don't have authentication
export default api;