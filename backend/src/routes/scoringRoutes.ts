import express from 'express';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import scoringService from '../services/scoringService';
import vectorService from '../services/vectorService';

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

// Bulk vector recalculation for all candidates of a job
router.post('/vector-recalculate/:jobId', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId).select('+embedding');
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Regenerate job embedding if missing
    if (!job.embedding?.length) {
      try {
        const embeddingText = job.rawText || job.description;
        job.embedding = await vectorService.generateEmbedding(embeddingText);
        await job.save();
      } catch (err: any) {
        return res.status(500).json({ message: `Failed to generate job embedding: ${err.message}` });
      }
    }

    const candidates = await Candidate.find({ jobId: req.params.jobId }).select('+embedding');
    const updated = [];

    for (const candidate of candidates) {
      try {
        // Regenerate candidate embedding if missing
        if (!candidate.embedding?.length) {
          candidate.embedding = await vectorService.generateEmbedding(candidate.rawText || '');
        }

        const semanticScore = vectorService.scoreFromEmbeddings(job.embedding!, candidate.embedding);
        candidate.semanticScore = semanticScore;
        candidate.score.overall = semanticScore;
        await candidate.save();
        updated.push({ id: candidate._id, semanticScore });
      } catch (err: any) {
        console.warn(`Embedding failed for candidate ${candidate._id}:`, err.message);
      }
    }

    res.json({
      message: `Vector recalculation complete for ${updated.length}/${candidates.length} candidates`,
      updated
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;