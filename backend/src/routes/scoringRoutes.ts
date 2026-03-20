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

    await Candidate.update(candidate._id, {
      score: scoringResult.score,
      improvements: scoringResult.improvements,
    });

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
    const job = await Job.findById(req.params.jobId, true);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Regenerate job embedding if missing
    if (!job.embedding?.length) {
      try {
        const embeddingText = job.rawText || job.description;
        const embedding = await vectorService.generateEmbedding(embeddingText);
        await Job.update(job._id, { embedding });
        job.embedding = embedding;
      } catch (err: any) {
        return res.status(500).json({ message: `Failed to generate job embedding: ${err.message}` });
      }
    }

    const candidates = await Candidate.findByJobId(req.params.jobId, true);
    const updated = [];

    for (const candidate of candidates) {
      try {
        let { embedding } = candidate;

        // Regenerate candidate embedding if missing
        if (!embedding?.length) {
          embedding = await vectorService.generateEmbedding(candidate.rawText || '');
        }

        const semanticScore = vectorService.scoreFromEmbeddings(job.embedding!, embedding!);
        const updatedScore = { ...candidate.score, overall: semanticScore };

        await Candidate.update(candidate._id, {
          embedding,
          semanticScore,
          score: updatedScore,
        });

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
