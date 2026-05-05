/**
 * Async Resume Worker
 * -------------------
 * Standalone process: npm run worker
 * Pulls resume jobs from pg-boss queue (PostgreSQL) and runs the full 4-phase scoring pipeline.
 * Concurrency: 10 — processes up to 10 resumes simultaneously.
 * Retries: 2x on failure (3 total attempts).
 * No Redis dependency — queue lives in PostgreSQL.
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import PgBoss from 'pg-boss';
import { initDB } from '../db';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import Batch from '../models/Batch';
import parserService from '../services/parserService';
import scoringService, { extractCandidateData } from '../services/scoringService';
import vectorService from '../services/vectorService';
import redisService from '../services/redisService';
import agentService from '../services/agentService';
import { getBoss, QUEUE_NAME } from '../queue/batchQueue';
import type { ResumeJobData } from '../queue/batchQueue';

const LLM_MIN_SCORE = 40;
const CONCURRENCY   = 10;

// ── Phase 3 + LangGraph Agent Pipeline ──────────────────────────────────────
// Phase 3 adds the main change: instead of 4 separate agent HTTP calls with
// manual if/else routing, we make ONE call to the LangGraph graph-pipeline
// endpoint. LangGraph handles all conditional routing internally.
async function runHybridPipeline(
  candidateId: string,
  resumeText: string,
  jobId: string,
  baseSkillScore: number,
  existingBreakdown: any,
  overallScore: number,
  resumeHash: string
): Promise<void> {
  // Fetch job (with embeddings + jdStructured from Agent 1)
  let jobWithEmb = await Job.findById(jobId, true);
  if (!jobWithEmb?.sectionEmbeddings) {
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 3000));
      jobWithEmb = await Job.findById(jobId, true);
      if (jobWithEmb?.sectionEmbeddings) break;
    }
  }

  const jdStructured    = jobWithEmb?.jdStructured ?? null;
  const missingRequired = existingBreakdown.missingRequired ?? [];

  // ── Phase 3 + LangGraph pipeline run in parallel ─────────────────────────
  // Phase 3 (section embeddings) is pure math — stays in TypeScript.
  // LangGraph pipeline (Agents 2→3→4→5) is one HTTP call — handles all
  // conditional routing, validation, and Python-computed scoring internally.
  const [sectionEmbeddings, graphResult] = await Promise.all([

    // Phase 3: section-level semantic embeddings (unchanged)
    (async () => {
      if (!jobWithEmb?.sectionEmbeddings) return null;
      try {
        const cached = await redisService.getCachedEmbeddings(resumeHash);
        if (cached) return cached;
        const emb = await vectorService.generateSectionEmbeddings(resumeText, 'passage');
        await redisService.setCachedEmbeddings(resumeHash, emb);
        return emb;
      } catch (err: any) {
        console.warn(`Worker Phase 3 embeddings failed: ${err.message}`);
        return null;
      }
    })(),

    // LangGraph pipeline: Agents 2→3→4→5 with conditional routing
    // Python handles: grounding, Pydantic validation, Python math, validator node
    (baseSkillScore >= LLM_MIN_SCORE
      ? agentService.runGraphPipeline(
          resumeText, jdStructured, baseSkillScore, null, missingRequired
        ).catch((err: any) => {
          console.warn(`Worker LangGraph pipeline failed: ${err.message}`);
          return null;
        })
      : Promise.resolve(null)
    ),
  ]);

  // Phase 3 semantic score (independent of agent pipeline)
  let sectionSemanticScore: number | null = null;
  if (jobWithEmb?.sectionEmbeddings && sectionEmbeddings) {
    sectionSemanticScore = vectorService.scoreFromSectionEmbeddings(
      jobWithEmb.sectionEmbeddings,
      sectionEmbeddings
    );
  }

  // ── Score resolution ──────────────────────────────────────────────────────
  let finalScore:    number;
  let scoreBreakdown: any;
  let llmFeedback:   any = null;

  if (graphResult) {
    // LangGraph path: Python-computed final_score is authoritative
    finalScore    = Math.min(100, Math.max(0, graphResult.final_score));
    scoreBreakdown = {
      ...existingBreakdown,
      sectionSemanticScore,
      // llmScore = keyword/Phase1+2 baseline score (before agent analysis)
      // finalScore = agent-computed final — difference shows agent value
      llmScore:   baseSkillScore,
      finalScore,
    };
    llmFeedback = {
      keyStrengths:          graphResult.top_strengths,
      keyGaps:               graphResult.key_gaps,
      overallRecommendation: finalScore,
      verdict:               graphResult.verdict,
      recruiterNote:         graphResult.recruiter_note,
    };
    const path = `LangGraph/${graphResult.processing_path}`;
    const warns = graphResult.validation_warnings?.length
      ? ` warns:${graphResult.validation_warnings.join(',')}` : '';
    console.log(`Worker: [${path}] ${candidateId} → ${finalScore} (${graphResult.verdict})${warns}`);
  } else {
    // Fallback: keyword + semantic hybrid blend (no agents)
    const blended = scoringService.calculateHybridScore(
      baseSkillScore, sectionSemanticScore, null,
      extractCandidateData({ rawText: resumeText }), jobWithEmb!, existingBreakdown
    );
    finalScore    = blended.finalScore;
    scoreBreakdown = blended.scoreBreakdown;
    console.log(`Worker: [hybrid-fallback] ${candidateId} → ${finalScore}`);
  }

  // ── Build agentAnalysis for storage ──────────────────────────────────────
  const agentAnalysis = graphResult ? {
    resumeStructured: graphResult.resume_structured ?? undefined,
    skillValidation:  graphResult.skill_validation  ?? undefined,
    experienceMatch:  graphResult.experience_match  ?? undefined,
    synthesis: {
      final_score:     finalScore,
      verdict:         graphResult.verdict,
      score_breakdown: graphResult.score_breakdown,
      top_strengths:   graphResult.top_strengths,
      key_gaps:        graphResult.key_gaps,
      recruiter_note:  graphResult.recruiter_note,
    },
  } : undefined;

  // ── Build final score object ──────────────────────────────────────────────
  const existing  = await Candidate.findById(candidateId);
  const prevScore = existing?.score ?? { overall: 0, skillMatch: 0, experienceMatch: 0, educationMatch: 0, keywordMatch: 0 };

  const finalScoreObj = {
    overall:         finalScore,
    skillMatch:      graphResult?.score_breakdown?.skills     ?? existingBreakdown.skillMatchScore ?? prevScore.skillMatch,
    experienceMatch: graphResult?.experience_match?.experience_score ?? prevScore.experienceMatch,
    educationMatch:  prevScore.educationMatch,
    keywordMatch:    prevScore.keywordMatch,
  };

  // ── Cache + persist ───────────────────────────────────────────────────────
  await redisService.setCachedScore(resumeHash, jobId, {
    score:         finalScoreObj,
    scoreBreakdown,
    llmFeedback:   llmFeedback ?? undefined,
    extractedData: existing?.extractedData,
  });

  await Candidate.update(candidateId, {
    sectionEmbeddings: sectionEmbeddings ?? undefined,
    scoreBreakdown,
    llmFeedback:       llmFeedback ?? undefined,
    score:             finalScoreObj,
    agentAnalysis,
  });
}

// ── Main job processor ────────────────────────────────────────────────────────
async function processResumeJob(job: PgBoss.JobWithMetadata<ResumeJobData>): Promise<void> {
  const { batchId, jobId, filePath, fileName } = job.data;
  const attempt = (job.retrycount ?? 0) + 1;
  console.log(`Worker: processing ${fileName} (batch ${batchId}, attempt ${attempt})`);

  try {
    const dbJob = await Job.findById(jobId);
    if (!dbJob) throw new Error(`Job ${jobId} not found`);

    const text = await parserService.extractText(filePath);
    const parsedResume = parserService.parseResume(text, fileName);
    const resumeHash = parserService.computeTextHash(text);

    // ── Duplicate detection ────────────────────────────────────────────────────
    const cachedScore = await redisService.getCachedScore(resumeHash, jobId);
    if (cachedScore) {
      const existing = await Candidate.findByHashAndJob(resumeHash, jobId);
      if (existing) {
        console.log(`Worker: Redis cache hit ${fileName} — linking to batch`);
        await Candidate.linkToBatch(existing._id, batchId);
        await Batch.incrementDone(batchId);
        return;
      }
    }

    const duplicate = await Candidate.findByHashAndJob(resumeHash, jobId);
    if (duplicate) {
      console.log(`Worker: DB duplicate ${fileName} — linking to batch (no re-processing)`);
      // Populate Redis cache for next time
      if (!cachedScore && duplicate.scoreBreakdown) {
        await redisService.setCachedScore(resumeHash, jobId, {
          score:          duplicate.score,
          scoreBreakdown: duplicate.scoreBreakdown,
          llmFeedback:    duplicate.llmFeedback,
          extractedData:  duplicate.extractedData,
        });
      }
      await Candidate.linkToBatch(duplicate._id, batchId);
      await Batch.incrementDone(batchId);
      return;
    }

    // ── Phase 1 + 2: keyword scoring ──────────────────────────────────────────
    const scoringResult = scoringService.calculateScore(parsedResume, dbJob);
    console.log(`Worker: ${fileName} keyword score = ${scoringResult.score.overall}`);

    let candidate;
    try {
      candidate = await Candidate.create({
        jobId,
        batchId,
        ...parsedResume,
        score:          scoringResult.score,
        improvements:   scoringResult.improvements,
        resumePath:     filePath,
        fileName,
        status:         'new',
        extractedData:  scoringResult.extractedData,
        scoreBreakdown: scoringResult.scoreBreakdown,
        rawText:        text,
        resumeHash,
      });
    } catch (insertErr: any) {
      // Race condition: another worker inserted this (resume_hash, job_id) first
      if (insertErr.code === '23505') {
        console.log(`Worker: concurrent duplicate ${fileName} — linking to winning record`);
        const winner = await Candidate.findByHashAndJob(resumeHash, jobId);
        if (winner) await Candidate.linkToBatch(winner._id, batchId);
        await Batch.incrementDone(batchId);
        return;
      }
      throw insertErr;
    }

    // ── Phase 3 + 4: semantic + LLM ───────────────────────────────────────────
    await runHybridPipeline(
      candidate._id,
      text,
      jobId,
      scoringResult.score.overall,   // gate LLM on overall keyword score, not just skillMatch
      scoringResult.scoreBreakdown,
      scoringResult.score.overall,
      resumeHash
    );

    await Batch.incrementDone(batchId);
    console.log(`Worker: completed ${fileName}`);

  } catch (err: any) {
    console.error(`Worker: FAILED ${fileName} — ${err.message}`);
    // Only mark batch as failed when no more retries remain
    if ((job.retrycount ?? 0) >= (job.retrylimit ?? 0)) {
      await Batch.incrementFailed(batchId);
    }
    throw err;
  }
}

// ── Worker startup ────────────────────────────────────────────────────────────
async function startWorker(): Promise<void> {
  await initDB();
  console.log('Worker: PostgreSQL ready');

  const boss = await getBoss();

  await boss.work<ResumeJobData>(
    QUEUE_NAME,
    { teamSize: CONCURRENCY, teamConcurrency: CONCURRENCY, includeMetadata: true },
    processResumeJob as any
  );

  console.log(`Worker started — concurrency: ${CONCURRENCY}, queue: ${QUEUE_NAME} (pg-boss/PostgreSQL)`);

  process.on('SIGTERM', async () => {
    console.log('Worker: shutting down...');
    await boss.stop();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    console.log('Worker: shutting down...');
    await boss.stop();
    process.exit(0);
  });
}

startWorker().catch(err => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
