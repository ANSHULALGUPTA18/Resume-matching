import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fileUpload from 'express-fileupload';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Import routes
import jobRoutes from './routes/jobRoutes';
import candidateRoutes from './routes/candidateRoutes';
import scoringRoutes from './routes/scoringRoutes';
import interviewPrepRoutes from './routes/interviewPrepRoutes';

const app: Application = express();

// Middleware - CORS first
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// File upload middleware - BEFORE body parsers
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  abortOnLimit: true,
  createParentPath: true,
  useTempFiles: false
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  if (req.files) {
    console.log('Files received:', Object.keys(req.files));
  }
  next();
});

// Create upload directories if they don't exist
const uploadDirs = ['./uploads', './uploads/resumes', './uploads/jd'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Routes
app.use('/api/jobs', jobRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/scoring', scoringRoutes);
app.use('/api/interview-prep', interviewPrepRoutes);

console.log('Routes registered: /api/jobs, /api/candidates, /api/scoring, /api/interview-prep');

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Database connection with retry logic
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ats_resume_optimizer';

const connectWithRetry = () => {
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
      console.error('MongoDB connection failed:', err.message);
      console.log('Retrying MongoDB connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting reconnect...');
});

connectWithRetry();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
