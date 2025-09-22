import express from 'express';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import scoringService from '../services/scoringService';

const router = express.Router();

// Recalculate score for a candidate
router.post('/recalculate/:candidateId', async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.candidateId);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    const job = await Job.findById(candidate.jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const scoringResult = scoringService.calculateScore(candidate, job);
    
    candidate.score = scoringResult.score;
    candidate.improvements = scoringResult.improvements;
    await candidate.save();

    res.json({
      message: 'Score recalculated successfully',
      score: scoringResult.score,
      improvements: scoringResult.improvements
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get scoring breakdown
router.get('/:candidateId', async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.candidateId);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    res.json({
      score: candidate.score,
      improvements: candidate.improvements,
      status: candidate.status
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;