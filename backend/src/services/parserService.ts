import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

interface ParsedResume {
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
  };
  experience: any[];
  education: any[];
  skills: string[];
  certifications: string[];
  rawText: string;
}

interface ParsedJob {
  title: string;
  company: string;
  description: string;
  requirements: {
    skills: string[];
    experience: number;
    education: string[];
    certifications: string[];
  };
  keywords: string[];
  rawText: string;
}

class ParserService {
  // Extract text from PDF
  async extractTextFromPDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error('Failed to parse PDF file');
    }
  }

  // Extract text from DOCX
  async extractTextFromDOCX(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.error('Error parsing DOCX:', error);
      throw new Error('Failed to parse DOCX file');
    }
  }

  // Extract text based on file type
  async extractText(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.pdf':
        return await this.extractTextFromPDF(filePath);
      case '.docx':
      case '.doc':
        return await this.extractTextFromDOCX(filePath);
      case '.txt':
        return fs.readFileSync(filePath, 'utf-8');
      default:
        throw new Error('Unsupported file format');
    }
  }

  // Parse resume text
  parseResume(text: string): ParsedResume {
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
    
    const foundSkills = skillKeywords.filter(skill => 
      text.toLowerCase().includes(skill.toLowerCase())
    );

    // Extract experience sections (basic implementation)
    const experienceKeywords = ['experience', 'employment', 'work history'];
    const experienceSections: any[] = [];
    
    // Extract education (basic implementation)
    const educationKeywords = ['education', 'academic', 'qualification'];
    const educationSections: any[] = [];

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
  parseJobDescription(text: string): ParsedJob {
    const lines = text.split('\n').map(line => line.trim());
    
    // Extract title (usually one of the first lines)
    const title = lines.find(line => 
      line.length > 5 && 
      (line.includes('Engineer') || line.includes('Developer') || 
       line.includes('Manager') || line.includes('Analyst'))
    ) || 'Position';

    // Extract required skills
    const skillKeywords = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go',
      'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask',
      'MongoDB', 'PostgreSQL', 'MySQL', 'Docker', 'Kubernetes', 'AWS'
    ];
    
    const requiredSkills = skillKeywords.filter(skill => 
      text.toLowerCase().includes(skill.toLowerCase())
    );

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

export default new ParserService();