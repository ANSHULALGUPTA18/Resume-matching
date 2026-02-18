import axios from 'axios';

// Make sure this points to your backend
const API_BASE_URL = 'http://localhost:5000/api';

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