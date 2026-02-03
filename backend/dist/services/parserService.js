"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ParserService {
    // Extract text from PDF
    async extractTextFromPDF(filePath) {
        try {
            const dataBuffer = fs_1.default.readFileSync(filePath);
            const data = await (0, pdf_parse_1.default)(dataBuffer);
            return data.text;
        }
        catch (error) {
            console.error('Error parsing PDF:', error);
            throw new Error('Failed to parse PDF file');
        }
    }
    // Extract text from DOCX
    async extractTextFromDOCX(filePath) {
        try {
            const result = await mammoth_1.default.extractRawText({ path: filePath });
            return result.value;
        }
        catch (error) {
            console.error('Error parsing DOCX:', error);
            throw new Error('Failed to parse DOCX file');
        }
    }
    // Extract text based on file type
    async extractText(filePath) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        switch (ext) {
            case '.pdf':
                return await this.extractTextFromPDF(filePath);
            case '.docx':
            case '.doc':
                return await this.extractTextFromDOCX(filePath);
            case '.txt':
                return fs_1.default.readFileSync(filePath, 'utf-8');
            default:
                throw new Error('Unsupported file format');
        }
    }
    // Parse resume text
    parseResume(text) {
        const lines = text.split('\n').map(line => line.trim());
        // Extract email
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        const emailMatch = text.match(emailRegex);
        const email = emailMatch ? emailMatch[0] : '';
        // Extract phone
        const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/;
        const phoneMatch = text.match(phoneRegex);
        const phone = phoneMatch ? phoneMatch[0] : '';
        // Extract name (usually first non-empty line)
        const name = lines.find(line => line.length > 2 && !line.includes('@')) || 'Unknown';
        // Extract skills (common programming languages and technologies)
        const skillKeywords = [
            'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go', 'Swift',
            'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
            'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Azure',
            'Git', 'Linux', 'Agile', 'REST', 'GraphQL', 'CI/CD', 'Machine Learning', 'AI'
        ];
        const foundSkills = skillKeywords.filter(skill => text.toLowerCase().includes(skill.toLowerCase()));
        // Extract experience sections (basic implementation)
        const experienceKeywords = ['experience', 'employment', 'work history'];
        const experienceSections = [];
        // Extract education (basic implementation)
        const educationKeywords = ['education', 'academic', 'qualification'];
        const educationSections = [];
        return {
            personalInfo: {
                name,
                email,
                phone,
                location: '' // Would need more sophisticated parsing
            },
            experience: experienceSections,
            education: educationSections,
            skills: foundSkills,
            certifications: [],
            rawText: text
        };
    }
    // Parse job description
    parseJobDescription(text) {
        const lines = text.split('\n').map(line => line.trim());
        // Extract title (usually one of the first lines)
        const title = lines.find(line => line.length > 5 &&
            (line.includes('Engineer') || line.includes('Developer') ||
                line.includes('Manager') || line.includes('Analyst'))) || 'Position';
        // Extract required skills
        const skillKeywords = [
            'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go',
            'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask',
            'MongoDB', 'PostgreSQL', 'MySQL', 'Docker', 'Kubernetes', 'AWS'
        ];
        const requiredSkills = skillKeywords.filter(skill => text.toLowerCase().includes(skill.toLowerCase()));
        // Extract experience requirement (look for years)
        const experienceMatch = text.match(/(\d+)[\+\-]?\s*years?\s*(of)?\s*experience/i);
        const requiredExperience = experienceMatch ? parseInt(experienceMatch[1]) : 0;
        // Extract keywords for matching
        const keywords = text.toLowerCase()
            .split(/\W+/)
            .filter(word => word.length > 4)
            .filter((word, index, self) => self.indexOf(word) === index)
            .slice(0, 50); // Top 50 unique keywords
        return {
            title,
            company: 'Company Name', // Would need to be passed separately or extracted
            description: text.substring(0, 500),
            requirements: {
                skills: requiredSkills,
                experience: requiredExperience,
                education: [],
                certifications: []
            },
            keywords,
            rawText: text
        };
    }
}
exports.default = new ParserService();
