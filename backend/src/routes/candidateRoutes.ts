import express from 'express';
import { UploadedFile } from 'express-fileupload';
import path from 'path';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import parserService from '../services/parserService';
import scoringService from '../services/scoringService';

const router = express.Router();

// Upload and parse resumes
router.post('/upload/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Check if job exists
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (!req.files || !req.files.resumes) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const files = Array.isArray(req.files.resumes) 
      ? req.files.resumes 
      : [req.files.resumes];

    const results = [];

    for (const file of files) {
      const resumeFile = file as UploadedFile;
      const fileName = `resume_${Date.now()}_${resumeFile.name}`;
      const uploadPath = path.join(__dirname, '../../uploads/resumes', fileName);

      // Save file
      await resumeFile.mv(uploadPath);

      // Extract and parse
      const text = await parserService.extractText(uploadPath);
      const parsedResume = parserService.parseResume(text);

      // Calculate score
      const scoringResult = scoringService.calculateScore(parsedResume, job);

      // Save candidate
      const candidate = new Candidate({
        jobId,
        ...parsedResume,
        score: scoringResult.score,
        improvements: scoringResult.improvements,
        resumePath: uploadPath,
        fileName: resumeFile.name
      });

      await candidate.save();
      results.push(candidate);
    }

    res.json({
      message: `${results.length} resume(s) processed successfully`,
      candidates: results
    });
  } catch (error: any) {
    console.error('Error uploading resumes:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get candidates for a job
router.get('/job/:jobId', async (req, res) => {
  try {
    const candidates = await Candidate.find({ jobId: req.params.jobId })
      .sort({ 'score.overall': -1 });
    res.json(candidates);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Update candidate status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    
    res.json(candidate);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;