import axios from 'axios';

// Make sure this points to your backend
const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Remove the auth interceptor for now since we don't have authentication
export default api;