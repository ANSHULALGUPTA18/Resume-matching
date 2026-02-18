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
    console.log('Resume upload request received for job:', req.params.jobId);
    console.log('Files:', req.files ? Object.keys(req.files) : 'none');
    
    const { jobId } = req.params;
    
    // Check if job exists
    const job = await Job.findById(jobId);
    if (!job) {
      console.error('Job not found:', jobId);
      return res.status(404).json({ message: 'Job not found' });
    }

    if (!req.files || !req.files.resumes) {
      console.error('No files uploaded - req.files:', req.files);
      return res.status(400).json({ message: 'No resume files uploaded. Please select at least one resume.' });
    }
    
    console.log('Job found:', job.title, 'at', job.company);

    const files = Array.isArray(req.files.resumes) 
      ? req.files.resumes 
      : [req.files.resumes];

    console.log(`Processing ${files.length} resume file(s)`);
    const results = [];

    for (const file of files) {
      const resumeFile = file as UploadedFile;
      console.log('Processing resume:', resumeFile.name, 'Size:', resumeFile.size);
      
      const fileName = `resume_${Date.now()}_${resumeFile.name}`;
      const uploadPath = path.join(__dirname, '../../uploads/resumes', fileName);

      // Save file
      await resumeFile.mv(uploadPath);
      console.log('Resume saved to:', uploadPath);

      // Extract and parse
      const text = await parserService.extractText(uploadPath);
      console.log('Text extracted from resume, length:', text.length);
      
      const parsedResume = parserService.parseResume(text, resumeFile.name);
      console.log('Resume parsed, name:', parsedResume.personalInfo.name, ', skills found:', parsedResume.skills.length);

      // Calculate score
      const scoringResult = scoringService.calculateScore(parsedResume, job);
      console.log('Score calculated:', scoringResult.score.overall);

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
      console.log('Candidate saved:', candidate._id);
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