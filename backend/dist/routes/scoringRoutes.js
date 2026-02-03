"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Candidate_1 = __importDefault(require("../models/Candidate"));
const Job_1 = __importDefault(require("../models/Job"));
const scoringService_1 = __importDefault(require("../services/scoringService"));
const router = express_1.default.Router();
// Recalculate score for a candidate
router.post('/recalculate/:candidateId', async (req, res) => {
    try {
        const candidate = await Candidate_1.default.findById(req.params.candidateId);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }
        const job = await Job_1.default.findById(candidate.jobId);
        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }
        const scoringResult = scoringService_1.default.calculateScore(candidate, job);
        candidate.score = scoringResult.score;
        candidate.improvements = scoringResult.improvements;
        await candidate.save();
        res.json({
            message: 'Score recalculated successfully',
            score: scoringResult.score,
            improvements: scoringResult.improvements
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Get scoring breakdown
router.get('/:candidateId', async (req, res) => {
    try {
        const candidate = await Candidate_1.default.findById(req.params.candidateId);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }
        res.json({
            score: candidate.score,
            improvements: candidate.improvements,
            status: candidate.status
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.default = router;
