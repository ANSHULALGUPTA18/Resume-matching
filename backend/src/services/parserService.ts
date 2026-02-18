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

// Common stop words to exclude from keyword matching
const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'along', 'among', 'apply',
  'based', 'before', 'being', 'below', 'between', 'bonus', 'bring', 'build',
  'candidate', 'candidates', 'click', 'close', 'company', 'could',
  'description', 'desired', 'does', 'doing', 'during',
  'each', 'equal', 'every', 'experience', 'employer',
  'first', 'follow', 'from', 'further',
  'great', 'growth',
  'have', 'having', 'here', 'hiring',
  'ideal', 'including', 'information', 'into',
  'join', 'just',
  'know',
  'learn', 'least', 'level', 'location', 'looking',
  'major', 'make', 'many', 'minimum', 'more', 'most', 'much', 'must',
  'need', 'needs',
  'offer', 'only', 'open', 'opportunity', 'other', 'over',
  'part', 'please', 'plus', 'position', 'preferred', 'provide',
  'range', 'related', 'required', 'requirements', 'responsibilities',
  'responsibility', 'right', 'role',
  'same', 'should', 'skills', 'some', 'strong', 'such',
  'take', 'team', 'than', 'that', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'title', 'together',
  'under', 'understanding', 'upon', 'using',
  'very',
  'want', 'well', 'were', 'what', 'when', 'where', 'which', 'while',
  'will', 'with', 'within', 'work', 'working', 'would',
  'year', 'years', 'your',
]);

// Unified skill keywords used for both resume and JD parsing
const SKILL_KEYWORDS = [
  // Programming Languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go',
  'Swift', 'Kotlin', 'Rust', 'PHP', 'Scala', 'R', 'Perl', 'Dart',
  'Objective-C', 'MATLAB', 'Lua', 'Haskell', 'Elixir', 'Clojure',
  // Frontend
  'React', 'Angular', 'Vue', 'Svelte', 'Next.js', 'Nuxt.js', 'jQuery',
  'HTML', 'CSS', 'SASS', 'LESS', 'Tailwind', 'Bootstrap', 'Material UI',
  'Redux', 'Webpack', 'Vite',
  // Backend
  'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'Spring Boot',
  'FastAPI', 'NestJS', 'Rails', 'Laravel', 'ASP.NET',
  // Databases
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'SQLite', 'Oracle',
  'Cassandra', 'DynamoDB', 'Elasticsearch', 'SQL Server', 'Firebase',
  // Cloud & DevOps
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform', 'Ansible',
  'Jenkins', 'GitHub Actions', 'GitLab CI', 'CircleCI', 'Nginx', 'Apache',
  // Tools & Practices
  'Git', 'Linux', 'Agile', 'Scrum', 'REST', 'GraphQL', 'CI/CD',
  'Microservices', 'Serverless', 'TDD', 'BDD',
  // Data & AI
  'Machine Learning', 'Deep Learning', 'AI', 'NLP', 'Computer Vision',
  'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Spark', 'Hadoop',
  'Data Science', 'Data Engineering', 'ETL', 'Power BI', 'Tableau',
  // Mobile
  'React Native', 'Flutter', 'iOS', 'Android', 'SwiftUI',
  // Other
  'Blockchain', 'IoT', 'Cybersecurity', 'DevSecOps', 'OAuth', 'JWT',
  'WebSocket', 'RabbitMQ', 'Kafka', 'gRPC', 'Figma', 'Jira',
];

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
    if (!text || typeof text !== 'string') {
      return {
        personalInfo: { name: 'Unknown', email: '', phone: '', location: '' },
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        rawText: ''
      };
    }

    const lines = text.split('\n').map(line => line.trim());

    // Extract email
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const emailMatch = text.match(emailRegex);
    const email = emailMatch ? emailMatch[0] : '';

    // Extract phone
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/;
    const phoneMatch = text.match(phoneRegex);
    const phone = phoneMatch ? phoneMatch[0] : '';

    // Extract name with robust logic
    const name = this.extractName(lines, email, phone);

    // Extract skills using shared keyword list
    const foundSkills = this.extractSkillsFromText(text);

    // Extract experience sections
    const experience = this.extractExperience(text);

    // Extract education sections
    const education = this.extractEducation(text);

    // Extract certifications
    const certifications = this.extractCertifications(text);

    return {
      personalInfo: {
        name,
        email,
        phone,
        location: ''
      },
      experience,
      education,
      skills: foundSkills,
      certifications,
      rawText: text
    };
  }

  // Parse job description
  parseJobDescription(text: string): ParsedJob {
    if (!text || typeof text !== 'string') {
      return {
        title: 'Position',
        company: 'Company Name',
        description: '',
        requirements: { skills: [], experience: 0, education: [], certifications: [] },
        keywords: [],
        rawText: ''
      };
    }

    const lines = text.split('\n').map(line => line.trim());

    // Extract title (usually one of the first lines)
    const title = lines.find(line =>
      line.length > 5 &&
      (line.includes('Engineer') || line.includes('Developer') ||
       line.includes('Manager') || line.includes('Analyst') ||
       line.includes('Designer') || line.includes('Architect') ||
       line.includes('Specialist') || line.includes('Lead') ||
       line.includes('Director') || line.includes('Consultant'))
    ) || 'Position';

    // Extract required skills using shared keyword list
    const requiredSkills = this.extractSkillsFromText(text);

    // Extract experience requirement (look for years)
    const experienceMatch = text.match(/(\d+)[\+\-]?\s*years?\s*(of)?\s*experience/i);
    const requiredExperience = experienceMatch ? parseInt(experienceMatch[1]) : 0;

    // Extract education requirements
    const education = this.extractEducationRequirements(text);

    // Extract meaningful keywords (filtered of stop words and noise)
    const keywords = this.extractKeywords(text);

    return {
      title,
      company: 'Company Name',
      description: text.substring(0, 500),
      requirements: {
        skills: requiredSkills,
        experience: requiredExperience,
        education,
        certifications: []
      },
      keywords,
      rawText: text
    };
  }

  /**
   * Extract skills from text using the unified skill keywords list.
   * Returns deduplicated skills found in text.
   */
  private extractSkillsFromText(text: string): string[] {
    const textLower = text.toLowerCase();
    const found = new Set<string>();

    for (const skill of SKILL_KEYWORDS) {
      if (textLower.includes(skill.toLowerCase())) {
        found.add(skill);
      }
    }

    return Array.from(found);
  }

  /**
   * Extract experience entries from resume text by looking for
   * section headers and date patterns.
   */
  private extractExperience(text: string): any[] {
    const experiences: any[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Find experience section
    let inExperienceSection = false;
    const sectionHeaders = /^(experience|employment|work\s*history|professional\s*experience)/i;
    const otherSections = /^(education|skills|certifications|projects|awards|references|summary|objective)/i;
    const datePattern = /\b(20\d{2}|19\d{2})\s*[-–—to]+\s*(20\d{2}|19\d{2}|present|current|now)\b/i;

    let currentEntry: any = null;

    for (const line of lines) {
      if (sectionHeaders.test(line)) {
        inExperienceSection = true;
        continue;
      }
      if (inExperienceSection && otherSections.test(line)) {
        if (currentEntry) experiences.push(currentEntry);
        break;
      }

      if (inExperienceSection) {
        const hasDate = datePattern.test(line);
        if (hasDate) {
          if (currentEntry) experiences.push(currentEntry);
          const dateMatch = line.match(datePattern);
          currentEntry = {
            title: line.replace(datePattern, '').trim(),
            company: '',
            duration: dateMatch ? dateMatch[0] : '',
            description: ''
          };
        } else if (currentEntry) {
          if (!currentEntry.company && line.length > 2 && line.length < 80) {
            currentEntry.company = line;
          } else {
            currentEntry.description += (currentEntry.description ? ' ' : '') + line;
          }
        }
      }
    }

    if (currentEntry) experiences.push(currentEntry);
    return experiences;
  }

  /**
   * Extract education entries from resume text.
   */
  private extractEducation(text: string): any[] {
    const education: any[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let inEducationSection = false;
    const sectionHeader = /^(education|academic|qualification|degree)/i;
    const otherSections = /^(experience|skills|certifications|projects|awards|references|work)/i;
    const degreePattern = /\b(bachelor|master|phd|doctorate|associate|diploma|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|b\.?tech|m\.?tech|mba|b\.?e\.?)\b/i;

    for (const line of lines) {
      if (sectionHeader.test(line)) {
        inEducationSection = true;
        continue;
      }
      if (inEducationSection && otherSections.test(line)) {
        break;
      }

      if (inEducationSection && degreePattern.test(line)) {
        const yearMatch = line.match(/20\d{2}|19\d{2}/);
        education.push({
          degree: line,
          institution: '',
          year: yearMatch ? yearMatch[0] : ''
        });
      }
    }

    return education;
  }

  /**
   * Extract certification entries from resume text.
   */
  private extractCertifications(text: string): string[] {
    const certs: string[] = [];
    const certPatterns = [
      /\b(AWS\s+Certified\s+[\w\s-]+)/gi,
      /\b(Azure\s+(?:Administrator|Developer|Solutions\s+Architect)[\w\s-]*)/gi,
      /\b(Google\s+Cloud\s+(?:Professional|Associate)[\w\s-]*)/gi,
      /\b(PMP|CISSP|CCNA|CCNP|CKA|CKAD|CompTIA\s+\w+)/gi,
      /\b(Scrum\s+Master|Product\s+Owner)\b/gi,
    ];

    for (const pattern of certPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const cert = match[1].trim();
        if (!certs.includes(cert)) {
          certs.push(cert);
        }
      }
    }

    return certs;
  }

  /**
   * Extract education requirements from job description text.
   */
  private extractEducationRequirements(text: string): string[] {
    const education: string[] = [];
    const textLower = text.toLowerCase();

    const degrees = [
      { pattern: /\bph\.?d|doctorate\b/i, label: "PhD" },
      { pattern: /\bmaster'?s?\b|\bmba\b|\bm\.?s\.?\b|\bm\.?tech\b/i, label: "Master's" },
      { pattern: /\bbachelor'?s?\b|\bb\.?s\.?\b|\bb\.?a\.?\b|\bb\.?tech\b|\bb\.?e\.?\b/i, label: "Bachelor's" },
      { pattern: /\bassociate'?s?\b|\bdiploma\b/i, label: "Associate's" },
    ];

    for (const { pattern, label } of degrees) {
      if (pattern.test(textLower)) {
        education.push(label);
      }
    }

    return education;
  }

  /**
   * Extract meaningful keywords from job description text,
   * filtering out stop words and very common words.
   */
  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .filter(word => !STOP_WORDS.has(word))
      .filter(word => !/^\d+$/.test(word)) // exclude pure numbers
      .filter((word, index, self) => self.indexOf(word) === index)
      .slice(0, 40);
  }

  /**
   * Robust name extraction from resume text.
   * Tries multiple strategies in order of reliability:
   * 1. First line that looks like a human name (2-4 capitalized words)
   * 2. First non-empty line that isn't an email, phone, URL, or section header
   * 3. Fallback to filename-based extraction or 'Unknown'
   */
  private extractName(lines: string[], email: string, phone: string): string {
    // Section headers and non-name patterns to skip
    const sectionHeaders = /^(summary|objective|experience|education|skills|certifications|projects|references|profile|contact|about|work|employment|professional|technical|personal|curriculum|resume|cv)\b/i;
    const urlPattern = /^(https?:\/\/|www\.)/i;
    const datePattern = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d{2}|19\d{2})/i;
    const phonePattern = /^[\+\d\(\).\-\s]{7,}/;

    // Strategy 1: Look for a line that matches typical name patterns
    // (2-4 words, each starting with uppercase, no special characters)
    const namePattern = /^[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,3}$/;

    for (const line of lines.slice(0, 10)) { // only check first 10 lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3 || trimmed.length > 60) continue;

      // Skip lines that are clearly not names
      if (trimmed.includes('@')) continue;
      if (sectionHeaders.test(trimmed)) continue;
      if (urlPattern.test(trimmed)) continue;
      if (datePattern.test(trimmed)) continue;
      if (phonePattern.test(trimmed)) continue;
      if (email && trimmed.includes(email)) continue;
      if (phone && trimmed.includes(phone)) continue;

      // Check if line looks like a proper name
      if (namePattern.test(trimmed)) {
        return trimmed;
      }
    }

    // Strategy 2: Relaxed matching - first reasonable line in top 5
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3 || trimmed.length > 60) continue;
      if (trimmed.includes('@')) continue;
      if (sectionHeaders.test(trimmed)) continue;
      if (urlPattern.test(trimmed)) continue;
      if (phonePattern.test(trimmed)) continue;

      // Must contain at least one letter and have at least 2 "word" parts
      const words = trimmed.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
      if (words.length >= 2 && words.length <= 5) {
        return trimmed;
      }
    }

    // Strategy 3: Try to extract name from email (e.g., john.doe@email.com → John Doe)
    if (email) {
      const localPart = email.split('@')[0];
      const nameParts = localPart.split(/[._-]/).filter(p => p.length > 1 && /^[a-zA-Z]+$/.test(p));
      if (nameParts.length >= 2) {
        return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }

    return 'Unknown';
  }
}

export default new ParserService();
