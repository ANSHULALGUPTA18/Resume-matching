"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const Job_1 = __importDefault(require("../models/Job"));
const parserService_1 = __importDefault(require("../services/parserService"));
const router = express_1.default.Router();
// Upload and parse job description
router.post('/upload', async (req, res) => {
    try {
        if (!req.files || !req.files.jd) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const jdFile = req.files.jd;
        const fileName = `jd_${Date.now()}${path_1.default.extname(jdFile.name)}`;
        const uploadPath = path_1.default.join(__dirname, '../../uploads/jd', fileName);
        // Save file
        await jdFile.mv(uploadPath);
        // Extract text
        const text = await parserService_1.default.extractText(uploadPath);
        // Parse job description
        const parsedJob = parserService_1.default.parseJobDescription(text);
        // Determine company safely (req.body may be undefined when only files are sent)
        const companyName = req.body && req.body.company
            ? req.body.company
            : 'Company';
        // Save to database
        const job = new Job_1.default({
            ...parsedJob,
            fileName: jdFile.name,
            company: companyName
        });
        await job.save();
        res.json({
            message: 'Job description uploaded and parsed successfully',
            job
        });
    }
    catch (error) {
        console.error('Error uploading JD:', error);
        res.status(500).json({ message: error.message });
    }
});
// Get all jobs
router.get('/', async (req, res) => {
    try {
        const jobs = await Job_1.default.find().sort({ createdAt: -1 });
        res.json(jobs);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Get single job
router.get('/:id', async (req, res) => {
    try {
        const job = await Job_1.default.findById(req.params.id);
        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }
        res.json(job);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Import job description from raw text
router.post('/import-text', async (req, res) => {
    try {
        const body = req.body || {};
        const text = body.text;
        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ message: 'Text is required' });
        }
        const companyName = body.company && typeof body.company === 'string' ? body.company : 'Company';
        const titleFromBody = body.title && typeof body.title === 'string' ? body.title : undefined;
        // Parse job description
        const parsedJob = parserService_1.default.parseJobDescription(text);
        const job = new Job_1.default({
            title: titleFromBody || parsedJob.title || 'Job Title',
            company: companyName,
            description: parsedJob.description || '',
            requirements: parsedJob.requirements || { skills: [], experience: 0, education: [], certifications: [] },
            keywords: parsedJob.keywords || [],
            rawText: text,
            fileName: body.fileName || 'manual-input.txt'
        });
        await job.save();
        res.json({
            message: 'Job description imported successfully',
            job
        });
    }
    catch (error) {
        console.error('Error importing JD from text:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.default = router;
