import express from 'express';
import { UploadedFile } from 'express-fileupload';
import path from 'path';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import parserService from '../services/parserService';
import scoringService, { extractCandidateData } from '../services/scoringService';
import vectorService from '../services/vectorService';

const router = express.Router();

// LLM re-ranking threshold: only call Ollama for candidates above this keyword score
const LLM_MIN_SCORE = 40;

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
  existingBreakdown: any
): Promise<void> {
  try {
    // Phase 3 — section embeddings
    let sectionSemanticScore: number | null = null;
    let sectionEmbeddings: any = null;

    const jobWithEmb = await Job.findById(jobId, true);
    if (jobWithEmb?.sectionEmbeddings) {
      try {
        sectionEmbeddings = await vectorService.generateSectionEmbeddings(resumeText, 'passage');
        sectionSemanticScore = vectorService.scoreFromSectionEmbeddings(
          jobWithEmb.sectionEmbeddings,
          sectionEmbeddings
        );
        console.log(`Candidate ${candidateId}: section semantic score = ${sectionSemanticScore}`);
      } catch (err: any) {
        console.warn(`Candidate ${candidateId}: section embedding failed —`, err.message);
      }
    } else {
      console.warn(`Candidate ${candidateId}: job has no section embeddings yet, skipping Phase 3`);
    }

    // Phase 4 — LLM re-ranking (only for promising candidates)
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

    // Persist results
    await Candidate.update(candidateId, {
      sectionEmbeddings: sectionEmbeddings ?? undefined,
      scoreBreakdown,
      llmFeedback: llmFeedback ?? undefined,
      score: {
        overall: finalScore,
        skillMatch:       existingBreakdown.skillMatchScore ?? prevScore.skillMatch,
        experienceMatch:  prevScore.experienceMatch,
        educationMatch:   prevScore.educationMatch,
        keywordMatch:     prevScore.keywordMatch,
      },
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

    for (const file of files) {
      const resumeFile = file as UploadedFile;
      console.log('Processing resume:', resumeFile.name);

      const fileName = `resume_${Date.now()}_${resumeFile.name}`;
      const uploadPath = path.join(__dirname, '../../uploads/resumes', fileName);

      await resumeFile.mv(uploadPath);

      const text = await parserService.extractText(uploadPath);
      const parsedResume = parserService.parseResume(text, resumeFile.name);
      console.log('Resume parsed:', parsedResume.personalInfo.name, '| skills:', parsedResume.skills.length);

      // Duplicate detection — skip if same resume content already processed for this job
      const resumeHash = parserService.computeTextHash(text);
      const duplicate = await Candidate.findByHashAndJob(resumeHash, jobId);
      if (duplicate) {
        console.log(`Duplicate resume detected: ${resumeFile.name} — skipping`);
        results.push({ ...duplicate, isDuplicate: true } as any);
        continue;
      }

      // Phase 1+2: keyword scoring + hard filters
      const scoringResult = scoringService.calculateScore(parsedResume, job);
      console.log('Keyword score:', scoringResult.score.overall);

      // Phase 2.5: whole-doc embedding (for legacy similarity, kept for compatibility)
      let embedding: number[] | undefined;
      try {
        embedding = await vectorService.generateEmbedding(text, 'passage');
      } catch (err: any) {
        console.warn('Whole-doc embedding failed:', err.message);
      }

      const candidate = await Candidate.create({
        jobId,
        ...parsedResume,
        score: scoringResult.score,
        improvements: scoringResult.improvements,
        resumePath: uploadPath,
        fileName: resumeFile.name,
        status: 'new',
        embedding,
        extractedData: scoringResult.extractedData,
        scoreBreakdown: scoringResult.scoreBreakdown,
        rawText: text,
        resumeHash,
      });

      console.log('Candidate saved:', candidate._id);

      // Phase 3+4 run asynchronously (don't block the response)
      runHybridPipeline(
        candidate._id,
        text,
        jobId,
        scoringResult.score.skillMatch,
        scoringResult.scoreBreakdown
      ).catch(() => {});

      results.push(candidate);
    }

    res.json({
      message: `${results.length} resume(s) processed successfully`,
      candidates: results,
    });
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
