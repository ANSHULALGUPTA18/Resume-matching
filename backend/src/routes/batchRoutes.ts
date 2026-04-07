/**
 * Batch Processing Routes
 * -----------------------
 * POST /api/batch/upload        — queue all resumes, return batchId immediately
 * GET  /api/batch/:id/status    — JSON snapshot of progress
 * GET  /api/batch/:id/progress  — SSE stream; pushes updates as resumes finish
 */

import express from 'express';
import path from 'path';
import { UploadedFile } from 'express-fileupload';
import Job from '../models/Job';
import Batch from '../models/Batch';
import { getBoss, QUEUE_NAME } from '../queue/batchQueue';

const router = express.Router();

// ── POST /api/batch/upload ────────────────────────────────────────────────────
// Accepts: multipart/form-data  { jobId: string, resumes: File[] }
// Returns: { batchId, jobId, totalQueued }  in < 1 second
router.post('/upload', async (req, res) => {
  try {
    const jobId: string = (req.body as any)?.jobId;
    if (!jobId) {
      return res.status(400).json({ message: 'jobId is required' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (!req.files || !req.files.resumes) {
      return res.status(400).json({ message: 'No resume files provided' });
    }

    const files = Array.isArray(req.files.resumes)
      ? req.files.resumes as UploadedFile[]
      : [req.files.resumes as UploadedFile];

    // Create batch record FIRST so the worker can update it
    const batchId = await Batch.create(jobId, files.length);

    const boss = await getBoss();

    // Save files to disk and push one job per resume into pg-boss queue
    let queued = 0;
    for (const file of files) {
      const resumeFile = file as UploadedFile;
      const savedName  = `resume_${Date.now()}_${Math.random().toString(36).slice(2,7)}_${resumeFile.name}`;
      const filePath   = path.join(__dirname, '../../uploads/resumes', savedName);
      await resumeFile.mv(filePath);

      await boss.send(QUEUE_NAME, {
        batchId,
        jobId,
        filePath,
        fileName: resumeFile.name,
      }, { retryLimit: 2, retryDelay: 3, retryBackoff: true });
      queued++;
    }

    res.json({ batchId, jobId, totalQueued: queued });

  } catch (err: any) {
    console.error('Batch upload error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/batch/:id/status  (JSON) ────────────────────────────────────────
router.get('/:id/status', async (req, res) => {
  try {
    const batch = await Batch.getBatch(req.params.id);
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/batch/:id/progress  (Server-Sent Events) ────────────────────────
// The frontend opens this connection and receives live updates as resumes finish.
// Each event: { total, done, failed, status, newCandidates[] }
// Connection auto-closes when batch status becomes 'complete'.
router.get('/:id/progress', async (req, res) => {
  const batchId = req.params.id;

  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable buffering
  res.flushHeaders();

  let lastSentCount = 0;
  let finished = false;

  const send = (data: object) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  // Send heartbeat every 20s so the connection stays alive through load balancers
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 20_000);

  const poll = setInterval(async () => {
    if (finished) return;
    try {
      const batch = await Batch.getBatch(batchId);
      if (!batch) {
        send({ error: 'Batch not found' });
        cleanup();
        return;
      }

      const newCandidates = await Batch.getRecentCandidates(batchId, lastSentCount);
      if (newCandidates.length > 0 || batch.status === 'complete') {
        lastSentCount += newCandidates.length;

        // Mark candidates that existed before this batch as cached/deduped
        const batchCreated = new Date(batch.createdAt).getTime();
        let cachedCount = 0;
        const tagged = newCandidates.map((c: any) => {
          const fromCache = new Date(c.createdAt).getTime() < batchCreated - 2000;
          if (fromCache) cachedCount++;
          return { ...c, fromCache };
        });

        send({
          total:         batch.totalCount,
          done:          batch.doneCount,
          failed:        batch.failedCount,
          status:        batch.status,
          cachedCount,
          newCandidates: tagged,
        });
      }

      if (batch.status === 'complete') {
        cleanup();
      }
    } catch (err: any) {
      console.error(`SSE poll error for batch ${batchId}:`, err.message);
    }
  }, 1500); // poll every 1.5 seconds

  const cleanup = () => {
    finished = true;
    clearInterval(poll);
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  };

  req.on('close', cleanup);
});

export default router;
