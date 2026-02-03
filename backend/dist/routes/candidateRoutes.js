"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const Candidate_1 = __importDefault(require("../models/Candidate"));
const Job_1 = __importDefault(require("../models/Job"));
const parserService_1 = __importDefault(require("../services/parserService"));
const scoringService_1 = __importDefault(require("../services/scoringService"));
const router = express_1.default.Router();
// Upload and parse resumes
router.post('/upload/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        // Check if job exists
        const job = await Job_1.default.findById(jobId);
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
            const resumeFile = file;
            const fileName = `resume_${Date.now()}_${resumeFile.name}`;
            const uploadPath = path_1.default.join(__dirname, '../../uploads/resumes', fileName);
            // Save file
            await resumeFile.mv(uploadPath);
            // Extract and parse
            const text = await parserService_1.default.extractText(uploadPath);
            const parsedResume = parserService_1.default.parseResume(text);
            // Calculate score
            const scoringResult = scoringService_1.default.calculateScore(parsedResume, job);
            // Save candidate
            const candidate = new Candidate_1.default({
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
    }
    catch (error) {
        console.error('Error uploading resumes:', error);
        res.status(500).json({ message: error.message });
    }
});
// Get candidates for a job
router.get('/job/:jobId', async (req, res) => {
    try {
        const candidates = await Candidate_1.default.find({ jobId: req.params.jobId })
            .sort({ 'score.overall': -1 });
        res.json(candidates);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Update candidate status
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const candidate = await Candidate_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }
        res.json(candidate);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.default = router;
