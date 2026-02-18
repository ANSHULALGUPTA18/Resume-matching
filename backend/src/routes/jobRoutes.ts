import express from 'express';
import { UploadedFile } from 'express-fileupload';
import path from 'path';
import Job from '../models/Job';
import parserService from '../services/parserService';

const router = express.Router();

// Upload and parse job description
router.post('/upload', async (req, res) => {
  try {
    console.log('Job upload request received');
    console.log('Files:', req.files ? Object.keys(req.files) : 'none');
    console.log('Body:', req.body);
    
    if (!req.files || !req.files.jd) {
      console.error('No file uploaded - req.files:', req.files);
      return res.status(400).json({ message: 'No file uploaded. Please select a job description file.' });
    }

    const jdFile = req.files.jd as UploadedFile;
    console.log('File received:', jdFile.name, 'Size:', jdFile.size);
    
    const fileName = `jd_${Date.now()}${path.extname(jdFile.name)}`;
    const uploadPath = path.join(__dirname, '../../uploads/jd', fileName);

    // Save file
    await jdFile.mv(uploadPath);
    console.log('File saved to:', uploadPath);

    // Extract text
    const text = await parserService.extractText(uploadPath);
    console.log('Text extracted, length:', text.length);
    
    // Parse job description
    const parsedJob = parserService.parseJobDescription(text);

    // Determine company safely
    const companyName = req.body && req.body.company
      ? req.body.company
      : 'Company';

    // Save to database
    const job = new Job({
      ...parsedJob,
      fileName: jdFile.name,
      company: companyName
    });

    await job.save();

    res.json({
      message: 'Job description uploaded and parsed successfully',
      job
    });
  } catch (error: any) {
    console.error('Error uploading JD:', error);
    const message = error.message || 'Failed to process job description';
    res.status(500).json({ message });
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

// Import job description from raw text
router.post('/import-text', async (req, res) => {
  try {
    const body = (req as any).body || {};
    const text: string = body.text;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const companyName: string = body.company && typeof body.company === 'string' ? body.company : 'Company';
    const titleFromBody: string | undefined = body.title && typeof body.title === 'string' ? body.title : undefined;

    // Parse job description
    const parsedJob = parserService.parseJobDescription(text);

    const job = new Job({
      title: titleFromBody || parsedJob.title || 'Job Title',
      company: companyName,
      description: parsedJob.description || '',
      requirements: parsedJob.requirements || { skills: [], experience: 0, education: [], certifications: [] },
      keywords: parsedJob.keywords || [],
      rawText: text,
      fileName: body.fileName || 'manual-input.txt'
    });

    await job.save();

    res.json({
      message: 'Job description imported successfully',
      job
    });
  } catch (error: any) {
    console.error('Error importing JD from text:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;