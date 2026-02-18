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
  // Extract text from PDF using pdfjs-dist with proper line-break detection
  async extractTextFromPDF(filePath: string): Promise<string> {
    try {
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
      const dataBuffer = fs.readFileSync(filePath);
      const uint8Array = new Uint8Array(dataBuffer);

      const doc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
      const textParts: string[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const items = content.items as any[];

        if (items.length === 0) continue;

        // Build lines by detecting Y-position changes
        let currentLine = '';
        let lastY: number | null = null;

        for (const item of items) {
          const y = Math.round(item.transform[5]); // Y-position from transform matrix
          if (lastY !== null && Math.abs(y - lastY) > 3) {
            // Y changed significantly — this is a new line
            textParts.push(currentLine.trim());
            currentLine = '';
          }
          currentLine += (currentLine && item.str ? ' ' : '') + item.str;
          lastY = y;
        }
        if (currentLine.trim()) {
          textParts.push(currentLine.trim());
        }
      }

      const fullText = textParts.filter(l => l.length > 0).join('\n').trim();

      if (fullText.length === 0) {
        throw new Error(
          'No text could be extracted from this PDF. It may be image-based (scanned). ' +
          'Please use the "Write Text" option to paste the job description manually.'
        );
      }

      return fullText;
    } catch (error: any) {
      console.error('Error parsing PDF:', error.message);
      if (error.message.includes('No text could be extracted')) {
        throw error;
      }
      throw new Error(
        'Failed to parse PDF file. The file may be corrupted or in an unsupported format. ' +
        'Try re-saving it as a new PDF, or use the "Write Text" option instead.'
      );
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

  // Parse resume text (fileName is optional, used as fallback for name extraction)
  parseResume(text: string, fileName?: string): ParsedResume {
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
    const name = this.extractName(lines, email, phone, fileName);

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
   * Handles sidebar layouts, non-standard ordering, and multi-column PDFs.
   *
   * Strategies (in order):
   * 1. Scan ALL lines for a clean "Firstname Lastname" pattern (mixed case)
   * 2. Scan ALL lines for an ALL-CAPS name (e.g., "ANSHU LAL GUPTA")
   * 3. Look for name near email/phone context lines
   * 4. Derive from email address
   * 5. Derive from filename
   */
  private extractName(lines: string[], email: string, phone: string, fileName?: string): string {
    // Check if a string looks like a human name
    const isNameLike = (s: string): boolean => {
      const words = s.trim().split(/\s+/);
      if (words.length < 2 || words.length > 4) return false;
      return words.every(w => /^[A-Za-z'-]+$/.test(w) && w.length >= 2);
    };

    // Convert to Title Case
    const toTitleCase = (s: string): string =>
      s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    // Check if a segment is a name (not a job title, cert, or tech term)
    const isNotJobTitle = (s: string): boolean => {
      const l = s.toLowerCase();
      const titleWords = ['manager', 'engineer', 'developer', 'analyst', 'director', 'specialist',
        'technician', 'coordinator', 'consultant', 'administrator', 'professional', 'certified',
        'architect', 'designer', 'lead', 'senior', 'junior', 'intern', 'associate', 'officer',
        'project', 'management', 'network', 'field', 'pmp', 'safe', 'scrum', 'agile'];
      const hits = titleWords.filter(t => l.includes(t)).length;
      return hits === 0;
    };

    // Strategy 0: Extract name from header lines with separators (|, tabs)
    // e.g., "Calvin McGuire | +1(804) 296-5691 | email@example.com"
    // e.g., "ADIKA MAUL Tallahassee, FL | 850-242-3188"
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip lines that are clearly section content (contain : followed by list items)
      if (/:\s+\S/.test(trimmed) && !trimmed.includes('|')) continue;

      // Split by common separators used in resume headers
      const segments = trimmed.split(/[|·•\t]/).map(s => s.trim()).filter(s => s.length > 0);
      const firstSeg = segments[0];

      if (firstSeg) {
        // Clean: remove phone, email, and trailing content
        let candidate = firstSeg
          .replace(/\+?\d[\d\s().-]{8,}/, '')              // remove phone numbers
          .replace(/\b[A-Za-z0-9._%+-]+@\S+/, '')          // remove email
          .replace(/,\s*[A-Z]{2}\b.*$/, '')                 // remove ", FL" etc.
          .replace(/,.*$/, '')                               // remove everything after first comma
          .replace(/\b\d{5,}\b.*$/, '')                     // remove zip codes
          .trim();

        // First try: use the original space-separated words (before any splitting)
        const origWords = candidate.split(/\s+/).filter(w =>
          /^[A-Za-z'-]+$/.test(w) && w.length >= 2 && w.length <= 12
        );

        if (origWords.length >= 2 && origWords.length <= 4) {
          const nameCandidate = origWords.join(' ');
          if (isNotJobTitle(nameCandidate)) {
            if (/^[A-Z\s'-]+$/.test(nameCandidate)) {
              return toTitleCase(nameCandidate);
            }
            if (isNameLike(nameCandidate)) {
              return nameCandidate;
            }
          }
        }
      }
    }

    // Lines that are definitely not names (for clean-line strategies)
    const nonNameLine = (line: string): boolean => {
      const l = line.trim();
      if (!l || l.length < 3 || l.length > 50) return true;
      if (l.includes('@')) return true;
      if (l.includes('://') || l.startsWith('www.')) return true;
      if (/^[\+\d\(\).\-\s]{7,}$/.test(l)) return true;
      if (/[:,;|•·\/\\]/.test(l)) return true;
      if (/^\d/.test(l)) return true;
      if (/^(summary|objective|experience|education|skills|certifications|projects|references|profile|contact|about|work|employment|professional|technical|personal|curriculum|resume|cv|languages|framework|tools|soft\s*skills|data|cloud|visualization|internship)\b/i.test(l)) return true;
      const techTerms = ['python', 'java', 'sql', 'react', 'node', 'docker', 'aws', 'azure', 'git', 'linux', 'html', 'css', 'api', 'ml', 'ai', 'etl', 'ci/cd'];
      const lLower = l.toLowerCase();
      const techCount = techTerms.filter(t => lLower.includes(t)).length;
      if (techCount >= 2) return true;
      if (!isNotJobTitle(l)) return true;
      return false;
    };

    // Strategy 1: Scan for mixed-case name (e.g., "Anshu Lal Gupta")
    const mixedCasePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/;
    for (const line of lines) {
      const trimmed = line.trim();
      if (nonNameLine(trimmed)) continue;
      if (mixedCasePattern.test(trimmed)) {
        return trimmed;
      }
    }

    // Strategy 2: Scan for ALL-CAPS name (e.g., "ANSHU LAL GUPTA")
    const allCapsPattern = /^[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+){1,3}$/;
    for (const line of lines) {
      const trimmed = line.trim();
      if (nonNameLine(trimmed)) continue;
      if (allCapsPattern.test(trimmed) && trimmed.length <= 40) {
        return toTitleCase(trimmed);
      }
    }

    // Strategy 3: First non-garbage line with 2-4 words
    for (const line of lines.slice(0, 15)) {
      const trimmed = line.trim();
      if (nonNameLine(trimmed)) continue;
      if (isNameLike(trimmed)) {
        return trimmed;
      }
    }

    // Strategy 4: Derive from filename (often the most reliable for DOCX)
    // Handles: "Anshu (1).pdf", "Comolyn Weeks_State of GA_Original (1).docx"
    if (fileName) {
      let baseName = fileName.replace(/\.[^.]+$/, '');
      baseName = baseName.replace(/^resume_\d+_/, '');
      const underscoreSegments = baseName.split('_');
      let nameSegment = underscoreSegments[0].trim();
      nameSegment = nameSegment.replace(/\s*\(\d+\)\s*/g, '').trim();

      const words = nameSegment.split(/\s+/).filter(w => /^[a-zA-Z'-]+$/.test(w) && w.length >= 2);
      if (words.length >= 2 && words.length <= 4) {
        const nameFromFile = words.map(w => {
          if (/[a-z]/.test(w) && /[A-Z]/.test(w)) return w;
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
        if (isNotJobTitle(nameFromFile)) {
          return nameFromFile;
        }
      }
    }

    // Strategy 5: Derive from email (e.g., john.doe@gmail.com → John Doe)
    if (email) {
      const localPart = email.split('@')[0];
      const nameParts = localPart.split(/[._-]/).filter(p => p.length > 1 && /^[a-zA-Z]+$/.test(p));
      if (nameParts.length >= 2) {
        return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }

    // Strategy 6: Derive from filename (single word / relaxed)
    if (fileName) {
      let baseName = fileName.replace(/\.[^.]+$/, '');
      baseName = baseName.replace(/^resume_\d+_/, '');
      const nameSegment = baseName.split('_')[0].replace(/\s*\(\d+\)\s*/g, '').trim();
      const words = nameSegment.split(/\s+/).filter(w => /^[a-zA-Z'-]+$/.test(w) && w.length >= 2);
      if (words.length >= 1 && words.length <= 4) {
        return words.map(w => {
          if (/[a-z]/.test(w) && /[A-Z]/.test(w)) return w;
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
      }
    }

    return 'Unknown';
  }
}

export default new ParserService();
