import express from 'express';
import { UploadedFile } from 'express-fileupload';
import path from 'path';
import Job from '../models/Job';
import parserService from '../services/parserService';

const router = express.Router();

// Upload and parse job description
router.post('/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.jd) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const jdFile = req.files.jd as UploadedFile;
    const fileName = `jd_${Date.now()}${path.extname(jdFile.name)}`;
    const uploadPath = path.join(__dirname, '../../uploads/jd', fileName);

    // Save file
    await jdFile.mv(uploadPath);

    // Extract text
    const text = await parserService.extractText(uploadPath);
    
    // Parse job description
    const parsedJob = parserService.parseJobDescription(text);

    // Save to database
    const job = new Job({
      ...parsedJob,
      fileName: jdFile.name,
      company: req.body.company || 'Company'
    });

    await job.save();

    res.json({
      message: 'Job description uploaded and parsed successfully',
      job
    });
  } catch (error: any) {
    console.error('Error uploading JD:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get single job
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.json(job);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;