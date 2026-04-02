import express from 'express';
import { UploadedFile } from 'express-fileupload';
import path from 'path';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import parserService from '../services/parserService';
import scoringService, { extractCandidateData } from '../services/scoringService';
import vectorService from '../services/vectorService';
import redisService from '../services/redisService';

const router = express.Router();

// LLM re-ranking threshold: only call Groq for candidates above this keyword score
const LLM_MIN_SCORE = 65;

/**
 * Full 4-phase pipeline (async, runs after candidate is saved).
 * Phase 3: section-level semantic scoring
 * Phase 4: LLM re-ranking for strong candidates (score >= LLM_MIN_SCORE)
 */
async function runHybridPipeline(
  candidateId: string,
  resumeText: string,
  jobId: string,
  baseSkillScore: number,
  existingBreakdown: any,
  overallScore?: number,
  resumeHash?: string
): Promise<void> {
  try {
    // Phase 3 — section embeddings
    let sectionSemanticScore: number | null = null;
    let sectionEmbeddings: any = null;

    // Wait for job embeddings if not ready yet (race condition: JD just uploaded)
    let jobWithEmb = await Job.findById(jobId, true);
    if (!jobWithEmb?.sectionEmbeddings) {
      console.log(`Candidate ${candidateId}: job embeddings not ready — waiting up to 20s`);
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 5000));
        jobWithEmb = await Job.findById(jobId, true);
        if (jobWithEmb?.sectionEmbeddings) break;
      }
    }

    if (jobWithEmb?.sectionEmbeddings) {
      try {
        // Check Redis embedding cache first — saves a Flask server call
        const cachedEmb = resumeHash ? await redisService.getCachedEmbeddings(resumeHash) : null;
        if (cachedEmb) {
          sectionEmbeddings = cachedEmb;
          console.log(`Candidate ${candidateId}: embeddings loaded from Redis cache`);
        } else {
          sectionEmbeddings = await vectorService.generateSectionEmbeddings(resumeText, 'passage');
          // Store in Redis for reuse (same resume on a different JD)
          if (resumeHash) await redisService.setCachedEmbeddings(resumeHash, sectionEmbeddings);
        }
        sectionSemanticScore = vectorService.scoreFromSectionEmbeddings(
          jobWithEmb.sectionEmbeddings,
          sectionEmbeddings
        );
        console.log(`Candidate ${candidateId}: section semantic score = ${sectionSemanticScore}`);
      } catch (err: any) {
        console.warn(`Candidate ${candidateId}: section embedding failed — ${err.message}`);
      }
    } else {
      console.warn(`Candidate ${candidateId}: job has no section embeddings — skipping Phase 3`);
    }

    // Phase 4 — LLM re-ranking (only for promising candidates)
    // Use baseSkillScore (raw skill match) not penalized overallScore — a candidate
    // with 79% skill match should still get LLM evaluation even if experience
    // penalty dropped their overall score below the threshold
    let llmScoreValue: number | null = null;
    let llmFeedback: any = null;

    if (baseSkillScore >= LLM_MIN_SCORE && jobWithEmb) {
      try {
        const llmResult = await vectorService.llmScore(
          jobWithEmb.rawText || jobWithEmb.description,
          resumeText
        );
        llmScoreValue = llmResult.overallRecommendation;
        llmFeedback = {
          keyStrengths: llmResult.keyStrengths,
          keyGaps: llmResult.keyGaps,
          overallRecommendation: llmResult.overallRecommendation,
        };
        console.log(`Candidate ${candidateId}: LLM score = ${llmScoreValue}`);
      } catch (err: any) {
        console.warn(`Candidate ${candidateId}: LLM scoring skipped —`, err.message);
      }
    }

    // Compute final hybrid score
    const { finalScore, scoreBreakdown } = scoringService.calculateHybridScore(
      baseSkillScore,
      sectionSemanticScore,
      llmScoreValue,
      extractCandidateData({ rawText: resumeText }),
      jobWithEmb!,
      existingBreakdown
    );

    // Fetch current candidate score to preserve experienceMatch / educationMatch / keywordMatch
    const existing = await Candidate.findById(candidateId);
    const prevScore = existing?.score ?? { overall: 0, skillMatch: 0, experienceMatch: 0, educationMatch: 0, keywordMatch: 0 };

    const finalScoreObj = {
      overall: finalScore,
      skillMatch:       existingBreakdown.skillMatchScore ?? prevScore.skillMatch,
      experienceMatch:  prevScore.experienceMatch,
      educationMatch:   prevScore.educationMatch,
      keywordMatch:     prevScore.keywordMatch,
    };

    // Save to Redis score cache (30-day TTL) — enables instant reuse for same resume+job
    if (resumeHash) {
      await redisService.setCachedScore(resumeHash, jobId, {
        score:         finalScoreObj,
        scoreBreakdown,
        llmFeedback:   llmFeedback ?? undefined,
        extractedData: existing?.extractedData,
      });
    }

    // Persist results to PostgreSQL
    await Candidate.update(candidateId, {
      sectionEmbeddings: sectionEmbeddings ?? undefined,
      scoreBreakdown,
      llmFeedback: llmFeedback ?? undefined,
      score: finalScoreObj,
    });

    console.log(`Candidate ${candidateId}: hybrid pipeline complete, final score = ${finalScore}`);
  } catch (err: any) {
    console.error(`Candidate ${candidateId}: hybrid pipeline error —`, err.message);
  }
}

// ── Upload and parse resumes ───────────────────────────────────────────────────

router.post('/upload/:jobId', async (req, res) => {
  try {
    console.log('Resume upload request received for job:', req.params.jobId);

    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (!req.files || !req.files.resumes) {
      return res.status(400).json({ message: 'No resume files uploaded. Please select at least one resume.' });
    }

    const files = Array.isArray(req.files.resumes)
      ? req.files.resumes
      : [req.files.resumes];

    console.log(`Processing ${files.length} resume file(s)`);
    const results = [];

    // Collect candidates needing Phase 3+4 — run sequentially AFTER response is sent
    const pipelineQueue: Array<{
      candidateId: string;
      text: string;
      baseSkillScore: number;
      breakdown: any;
      overall: number;
      resumeHash: string;
    }> = [];

    for (const file of files) {
      const resumeFile = file as UploadedFile;
      console.log('Processing resume:', resumeFile.name);

      const fileName = `resume_${Date.now()}_${resumeFile.name}`;
      const uploadPath = path.join(__dirname, '../../uploads/resumes', fileName);

      await resumeFile.mv(uploadPath);

      const text = await parserService.extractText(uploadPath);
      const parsedResume = parserService.parseResume(text, resumeFile.name);
      console.log('Resume parsed:', parsedResume.personalInfo.name, '| skills:', parsedResume.skills.length);

      // Duplicate detection — check Redis first (2ms), then PostgreSQL (50ms)
      const resumeHash = parserService.computeTextHash(text);

      const cachedScore = await redisService.getCachedScore(resumeHash, jobId);
      if (cachedScore) {
        // Redis hit — candidate was already fully scored; fetch from DB for full record
        const dbCandidate = await Candidate.findByHashAndJob(resumeHash, jobId);
        if (dbCandidate) {
          console.log(`Redis cache hit: ${resumeFile.name} — returning cached score`);
          results.push({ ...dbCandidate, isDuplicate: true } as any);
          continue;
        }
      }

      const duplicate = await Candidate.findByHashAndJob(resumeHash, jobId);
      if (duplicate) {
        console.log(`DB cache hit: ${resumeFile.name} — returning existing score`);
        // Backfill Redis if missing
        if (!cachedScore && duplicate.scoreBreakdown) {
          await redisService.setCachedScore(resumeHash, jobId, {
            score:         duplicate.score,
            scoreBreakdown: duplicate.scoreBreakdown,
            llmFeedback:   duplicate.llmFeedback,
            extractedData: duplicate.extractedData,
          });
        }
        results.push({ ...duplicate, isDuplicate: true } as any);
        continue;
      }

      // Phase 1+2: keyword scoring + hard filters
      const scoringResult = scoringService.calculateScore(parsedResume, job);
      console.log('Keyword score:', scoringResult.score.overall);

      const candidate = await Candidate.create({
        jobId,
        ...parsedResume,
        score: scoringResult.score,
        improvements: scoringResult.improvements,
        resumePath: uploadPath,
        fileName: resumeFile.name,
        status: 'new',
        extractedData: scoringResult.extractedData,
        scoreBreakdown: scoringResult.scoreBreakdown,
        rawText: text,
        resumeHash,
      });

      console.log('Candidate saved:', candidate._id);

      // Queue for sequential Phase 3+4 — do NOT fire in parallel
      pipelineQueue.push({
        candidateId: candidate._id,
        text,
        baseSkillScore: scoringResult.score.skillMatch,
        breakdown: scoringResult.scoreBreakdown,
        overall: scoringResult.score.overall,
        resumeHash,
      });

      results.push(candidate);
    }

    // Send Phase 1+2 results immediately, then run Phase 3+4 one-by-one in background
    res.json({
      message: `${results.length} resume(s) processed successfully`,
      candidates: results,
    });

    // Sequential pipeline — prevents embedding server overload
    (async () => {
      for (const item of pipelineQueue) {
        await runHybridPipeline(
          item.candidateId, item.text, jobId,
          item.baseSkillScore, item.breakdown, item.overall, item.resumeHash
        ).catch(() => {});
      }
    })();
  } catch (error: any) {
    console.error('Error uploading resumes:', error);
    res.status(500).json({ message: error.message });
  }
});

// ── Get candidates for a job ───────────────────────────────────────────────────

router.get('/job/:jobId', async (req, res) => {
  try {
    const candidates = await Candidate.findByJobId(req.params.jobId);
    res.json(candidates);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ── Delete all candidates for a job ───────────────────────────────────────────

router.delete('/job/:jobId', async (req, res) => {
  try {
    const deleted = await Candidate.deleteByJobId(req.params.jobId);
    res.json({ message: `Deleted ${deleted} candidate(s)`, deleted });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ── Re-run Phase 3+4 for candidates missing semantic/LLM scores ───────────────
// Useful when embedding server was down at upload time.

router.post('/job/:jobId/rescore', async (req, res) => {
  try {
    const { jobId } = req.params;
    const candidates = await Candidate.findByJobId(jobId);

    // Only rescore candidates that are missing semantic or LLM score
    const needsRescore = candidates.filter(c => {
      const sb = c.scoreBreakdown;
      return !sb || sb.sectionSemanticScore === null || sb.sectionSemanticScore === undefined;
    });

    if (needsRescore.length === 0) {
      return res.json({ message: 'All candidates already have complete scores', rescored: 0 });
    }

    res.json({ message: `Re-running Phase 3+4 for ${needsRescore.length} candidate(s)`, rescored: needsRescore.length });

    // Fire async pipeline for each — sequential to avoid overwhelming embedding server
    for (const c of needsRescore) {
      if (!c.rawText) continue;
      const sb = c.scoreBreakdown;
      const baseSkillScore = sb?.skillMatchScore ?? c.score.skillMatch ?? 0;
      const overallScore = c.score.overall ?? 0;
      await runHybridPipeline(
        c._id, c.rawText, jobId, baseSkillScore, sb ?? {}, overallScore
      ).catch(() => {});
    }
    console.log(`Rescore complete for job ${jobId}`);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ── Update candidate status ────────────────────────────────────────────────────

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const candidate = await Candidate.findByIdAndUpdate(req.params.id, { status });

    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    res.json(candidate);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
