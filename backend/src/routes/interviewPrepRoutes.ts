import express, { Request, Response } from 'express';
import { generateInterviewQuestions } from '../services/interviewPrepService';

const router = express.Router();

/**
 * POST /api/interview-prep
 * Generate personalized interview questions
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobDescription, resumeText } = req.body;

    if (!jobDescription || !resumeText) {
      res.status(400).json({
        success: false,
        message: 'Job description and resume text are required'
      });
      return;
    }

    const interviewQuestions = await generateInterviewQuestions(
      jobDescription,
      resumeText
    );

    res.json({
      success: true,
      data: interviewQuestions
    });
  } catch (error: any) {
    console.error('Error in interview prep route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate interview questions'
    });
  }
});

export default router;
