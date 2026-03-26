import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

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

// Comprehensive skill keywords covering modern tech stacks
const SKILL_KEYWORDS = [
  // ── Programming Languages ──────────────────────────────────────────────
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go',
  'Swift', 'Kotlin', 'Rust', 'PHP', 'Scala', 'R', 'Perl', 'Dart',
  'Objective-C', 'MATLAB', 'Lua', 'Haskell', 'Elixir', 'Clojure', 'Groovy',
  'Bash', 'Shell', 'PowerShell', 'Assembly', 'Cobol', 'Fortran', 'Erlang',
  'F#', 'OCaml', 'Julia', 'Zig',

  // ── Frontend ───────────────────────────────────────────────────────────
  'React', 'Angular', 'Vue', 'Svelte', 'Next.js', 'Nuxt.js', 'Remix',
  'Astro', 'SvelteKit', 'jQuery', 'Ember', 'Backbone',
  'HTML', 'CSS', 'SASS', 'LESS', 'Tailwind', 'Bootstrap', 'Material UI',
  'shadcn', 'Chakra UI', 'Ant Design', 'Radix UI',
  'Redux', 'Zustand', 'Recoil', 'Jotai', 'MobX',
  'Webpack', 'Vite', 'Rollup', 'esbuild', 'Parcel',
  'Storybook', 'Chromatic',

  // ── Backend ────────────────────────────────────────────────────────────
  'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'Spring Boot',
  'FastAPI', 'NestJS', 'Rails', 'Laravel', 'ASP.NET', 'Gin', 'Echo',
  'Fiber', 'Hono', 'Actix', 'Axum', 'Phoenix', 'Ktor', 'Micronaut',
  'Quarkus', 'Tornado', 'Sanic', 'Starlette', 'Litestar', 'Hapi',
  'Koa', 'Fastify', 'Symfony', 'CodeIgniter', 'CakePHP',

  // ── Databases ─────────────────────────────────────────────────────────
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'SQLite', 'Oracle',
  'Cassandra', 'DynamoDB', 'Elasticsearch', 'SQL Server', 'Firebase',
  'CockroachDB', 'ClickHouse', 'TimescaleDB', 'Snowflake', 'Redshift',
  'BigQuery', 'Databricks', 'Supabase', 'PlanetScale', 'Vitess',
  'Neo4j', 'ArangoDB', 'Couchbase', 'RavenDB', 'ScyllaDB',
  'MariaDB', 'Aurora', 'Neon', 'TiDB',
  // Vector DBs
  'Pinecone', 'Weaviate', 'ChromaDB', 'Qdrant', 'Milvus', 'pgvector',
  'Chroma', 'FAISS', 'Annoy',

  // ── Cloud & Infrastructure ─────────────────────────────────────────────
  'AWS', 'Azure', 'GCP', 'Cloudflare', 'DigitalOcean', 'Heroku', 'Vercel',
  'Netlify', 'Railway', 'Render', 'Fly.io',
  // AWS services
  'S3', 'Lambda', 'EC2', 'ECS', 'EKS', 'RDS', 'SageMaker', 'Bedrock',
  'CloudFormation', 'CDK', 'Boto3', 'SQS', 'SNS', 'CloudWatch',
  'CloudFront', 'Route 53', 'API Gateway', 'Cognito', 'IAM', 'Aurora',
  'Glue', 'Athena', 'EMR', 'Kinesis', 'Step Functions',
  // GCP services
  'BigQuery', 'Cloud Run', 'GKE', 'Pub/Sub', 'Vertex AI', 'Dataflow',
  'Cloud Functions', 'Firestore', 'Cloud Storage',
  // Azure services
  'Azure Functions', 'Azure DevOps', 'Azure AD', 'Azure Blob',
  'Azure Cosmos DB', 'Azure Kubernetes Service', 'Azure ML',

  // ── DevOps & CI/CD ─────────────────────────────────────────────────────
  'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Pulumi',
  'Jenkins', 'GitHub Actions', 'GitLab CI', 'CircleCI', 'Travis CI',
  'ArgoCD', 'FluxCD', 'Helm', 'Istio', 'Linkerd', 'Envoy',
  'Nginx', 'Apache', 'HAProxy', 'Traefik',
  'Vagrant', 'Packer', 'Chef', 'Puppet',
  'Linux', 'Ubuntu', 'CentOS', 'Debian', 'Alpine',

  // ── Observability & Monitoring ─────────────────────────────────────────
  'Prometheus', 'Grafana', 'Datadog', 'New Relic', 'Splunk', 'Dynatrace',
  'Elasticsearch', 'Kibana', 'Logstash', 'Jaeger', 'Zipkin', 'OpenTelemetry',
  'PagerDuty', 'Sentry', 'Rollbar',

  // ── AI / ML / Data Science ─────────────────────────────────────────────
  'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision',
  'TensorFlow', 'PyTorch', 'Keras', 'JAX',
  'Scikit-learn', 'XGBoost', 'LightGBM', 'CatBoost',
  'Pandas', 'NumPy', 'SciPy', 'Statsmodels', 'Polars',
  'Matplotlib', 'Seaborn', 'Plotly', 'Bokeh', 'Altair',
  'OpenCV', 'YOLO', 'Detectron', 'Transformers', 'HuggingFace',
  'BERT', 'GPT', 'LLM', 'RAG', 'Embeddings', 'Fine-tuning',
  'MLflow', 'Weights & Biases', 'DVC', 'Feast', 'Tecton',
  'Spark', 'Hadoop', 'Flink', 'Storm', 'Hive', 'Presto', 'Trino',
  'Power BI', 'Tableau', 'Looker', 'Metabase', 'Superset',
  // Data Engineering
  'Airflow', 'Prefect', 'Dagster', 'dbt', 'Fivetran', 'Airbyte', 'Talend',
  'Kafka', 'RabbitMQ', 'Celery', 'Redis Streams',

  // ── LLM / GenAI ────────────────────────────────────────────────────────
  'LangChain', 'LangGraph', 'LlamaIndex', 'Haystack', 'LiteLLM',
  'Pydantic AI', 'CrewAI', 'AutoGen', 'Semantic Kernel', 'DSPy',
  'OpenAI', 'Anthropic', 'Gemini', 'Ollama', 'Cohere', 'Mistral',
  'Stable Diffusion', 'Whisper', 'DALL-E', 'Claude',
  'Prompt Engineering', 'LangSmith', 'Guardrails', 'Instructor',

  // ── Tools & Practices ──────────────────────────────────────────────────
  'Git', 'GitHub', 'GitLab', 'Bitbucket', 'SVN',
  'Agile', 'Scrum', 'Kanban', 'SAFe', 'XP',
  'REST', 'GraphQL', 'gRPC', 'WebSocket', 'MQTT', 'AMQP',
  'CI/CD', 'DevOps', 'MLOps', 'DataOps', 'GitOps',
  'Microservices', 'Serverless', 'Event-Driven', 'Domain-Driven Design',
  'TDD', 'BDD', 'SOLID', 'Design Patterns', 'Clean Architecture',
  'OpenAPI', 'Swagger', 'Postman', 'Insomnia',

  // ── Testing ────────────────────────────────────────────────────────────
  'Jest', 'Vitest', 'Mocha', 'Chai', 'Jasmine',
  'Pytest', 'Unittest', 'Nose',
  'Selenium', 'Playwright', 'Cypress', 'Puppeteer',
  'JUnit', 'TestNG', 'Mockito', 'RSpec',
  'k6', 'JMeter', 'Locust', 'Gatling',

  // ── Security ───────────────────────────────────────────────────────────
  'OAuth', 'JWT', 'SAML', 'LDAP', 'Keycloak', 'Auth0', 'Okta',
  'OWASP', 'Penetration Testing', 'Vulnerability Assessment',
  'SSL', 'TLS', 'PKI', 'WAF', 'Zero Trust', 'IAM',
  'Cybersecurity', 'DevSecOps', 'SIEM', 'SOC',

  // ── Mobile ─────────────────────────────────────────────────────────────
  'React Native', 'Flutter', 'iOS', 'Android', 'SwiftUI',
  'Jetpack Compose', 'Expo', 'Capacitor', 'Ionic',
  'Xcode', 'Android Studio',

  // ── Collaboration & Project Tools ──────────────────────────────────────
  'Jira', 'Confluence', 'Notion', 'Linear', 'Asana', 'Trello',
  'Figma', 'Sketch', 'Adobe XD', 'InVision',
  'Slack', 'Teams',

  // ── Other ──────────────────────────────────────────────────────────────
  'Blockchain', 'IoT', 'Edge Computing', 'WebAssembly', 'WASM',
  'gRPC', 'Protocol Buffers', 'Thrift',
  'Elasticsearch', 'Solr', 'Lucene',
  'RabbitMQ', 'ActiveMQ', 'NATS', 'ZeroMQ',
  'Memcached', 'Varnish',
  'SQL', 'NoSQL', 'ETL', 'Data Warehousing', 'Data Lake',
  'Microservices', 'SOA', 'Event Sourcing', 'CQRS',
  'WebRTC', 'FFmpeg',
];

class ParserService {
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

        let currentLine = '';
        let lastY: number | null = null;

        for (const item of items) {
          const y = Math.round(item.transform[5]);
          if (lastY !== null && Math.abs(y - lastY) > 3) {
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
      if (error.message.includes('No text could be extracted')) throw error;
      throw new Error(
        'Failed to parse PDF file. The file may be corrupted or in an unsupported format. ' +
        'Try re-saving it as a new PDF, or use the "Write Text" option instead.'
      );
    }
  }

  async extractTextFromDOCX(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.error('Error parsing DOCX:', error);
      throw new Error('Failed to parse DOCX file');
    }
  }

  async extractText(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.pdf':  return await this.extractTextFromPDF(filePath);
      case '.docx':
      case '.doc':  return await this.extractTextFromDOCX(filePath);
      case '.txt':  return fs.readFileSync(filePath, 'utf-8');
      default:      throw new Error('Unsupported file format');
    }
  }

  parseResume(text: string, fileName?: string): ParsedResume {
    if (!text || typeof text !== 'string') {
      return {
        personalInfo: { name: 'Unknown', email: '', phone: '', location: '' },
        experience: [], education: [], skills: [], certifications: [], rawText: ''
      };
    }

    const lines = text.split('\n').map(line => line.trim());

    // PDF text extraction often inserts spaces around '@' — normalise before matching
    // e.g. "shubham @example.com" → "shubham@example.com"
    const normalizedText = text
      .replace(/([A-Za-z0-9._%+\-])\s+@\s*/g, '$1@')
      .replace(/([A-Za-z0-9])\s*@\s+([A-Za-z0-9])/g, '$1@$2');

    const emailRegex = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
    const emailMatch = normalizedText.match(emailRegex);
    const email = emailMatch ? emailMatch[0].trim() : '';

    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/;
    const phoneMatch = text.match(phoneRegex);
    const phone = phoneMatch ? phoneMatch[0] : '';

    const name = this.extractName(lines, email, phone, fileName);

    return {
      personalInfo: { name, email, phone, location: '' },
      experience: this.extractExperience(text),
      education: this.extractEducation(text),
      skills: this.extractSkillsFromText(text),
      certifications: this.extractCertifications(text),
      rawText: text
    };
  }

  parseJobDescription(text: string): ParsedJob {
    if (!text || typeof text !== 'string') {
      return {
        title: 'Position', company: 'Company Name', description: '',
        requirements: { skills: [], experience: 0, education: [], certifications: [] },
        keywords: [], rawText: ''
      };
    }

    const lines = text.split('\n').map(line => line.trim());

    const title = lines.find(line =>
      line.length > 5 &&
      (line.includes('Engineer') || line.includes('Developer') ||
       line.includes('Manager') || line.includes('Analyst') ||
       line.includes('Designer') || line.includes('Architect') ||
       line.includes('Specialist') || line.includes('Lead') ||
       line.includes('Director') || line.includes('Consultant') ||
       line.includes('Scientist') || line.includes('Administrator') ||
       line.includes('Officer') || line.includes('Coordinator'))
    ) || 'Position';

    const requiredSkills = this.extractSkillsFromText(text);
    const requiredExperience = this.extractExperienceRequirement(text);
    const education = this.extractEducationRequirements(text);
    const keywords = this.extractKeywords(text);
    const company = this.extractCompanyFromText(text);

    return {
      title,
      company,
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
   * Try to extract the company name from JD text.
   * Checks labelled fields first, then common intro sentence patterns.
   */
  private extractCompanyFromText(text: string): string {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // 1. Explicit label: "Company: Acme Corp" / "Employer: ..."
    const labelPattern = /^(?:company|employer|organization|client|posted by|hiring company)\s*[:\-]\s*(.+)/i;
    for (const line of lines) {
      const m = line.match(labelPattern);
      if (m && m[1].trim().length > 1) return m[1].trim();
    }

    // 2. "About Acme Corp" section header
    const aboutPattern = /^about\s+([A-Z][^\n]{2,59})/;
    for (const line of lines) {
      const m = line.match(aboutPattern);
      if (m && !/^(the |our |this |a |an )/i.test(m[1])) {
        return m[1].replace(/[.:,]+$/, '').trim();
      }
    }

    // 3. "Acme Corp is looking for / is hiring / is seeking"
    const hiringPattern = /^([A-Z][\w\s&.,'-]{2,49})\s+is\s+(?:looking|hiring|seeking|searching)/i;
    for (const line of lines.slice(0, 15)) {
      const m = line.match(hiringPattern);
      if (m) return m[1].trim();
    }

    // 4. "Acme Corp is a leading / top / global ..."
    const introPattern = /^([A-Z][\w\s&.,'-]{2,49})\s+is\s+(?:a|an)\s+(?:leading|top|global|world|fast|growing|premier|innovative)/i;
    for (const line of lines.slice(0, 20)) {
      const m = line.match(introPattern);
      if (m) return m[1].trim();
    }

    return 'Company';
  }

  /**
   * Extract experience requirement from JD text using multiple patterns.
   * Handles: "5+ years", "5-7 years", "5–7 Years", "minimum 5 years",
   *          "at least 5 years", "5 years of experience", "2 to 5 years"
   * Returns the minimum/lower bound of any range found.
   */
  private extractExperienceRequirement(text: string): number {
    const patterns = [
      // "5+ years of experience" / "5 years of experience"
      /(\d+)\s*\+?\s*years?\s+(?:of\s+)?(?:experience|exp)/i,
      // "experience of 5 years" / "experience: 5-7 years"
      /(?:experience|exp)[:\s]+(?:of\s+)?(\d+)\s*(?:[-–—to+]\s*\d+)?\s*years?/i,
      // "5-7 years" / "5–7 years" / "5—7 years" (range — take lower bound)
      /(\d+)\s*[-–—]\s*\d+\s*years?/i,
      // "2 to 5 years"
      /(\d+)\s+to\s+\d+\s*years?/i,
      // "minimum of 5 years" / "minimum 5 years"
      /minimum\s+(?:of\s+)?(\d+)\s*\+?\s*years?/i,
      // "at least 5 years"
      /at\s+least\s+(\d+)\s*\+?\s*years?/i,
      // "5+ years" standalone
      /(\d+)\s*\+\s*years?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > 0 && val <= 40) return val;
      }
    }
    return 0;
  }

  /**
   * Extract skills from text using the unified skill keywords list.
   * Matches case-insensitively, supports multi-word skills.
   */
  private extractSkillsFromText(text: string): string[] {
    const textLower = text.toLowerCase();
    const found = new Set<string>();

    for (const skill of SKILL_KEYWORDS) {
      const skillLower = skill.toLowerCase();
      // Use word-boundary-aware matching for short/ambiguous skills
      if (skillLower.length <= 3) {
        // Short skills: require word boundary to avoid false positives (e.g., "R" in "React")
        const regex = new RegExp(`(?<![a-zA-Z0-9])${escapeRegex(skillLower)}(?![a-zA-Z0-9])`, 'i');
        if (regex.test(text)) found.add(skill);
      } else {
        if (textLower.includes(skillLower)) found.add(skill);
      }
    }

    return Array.from(found);
  }

  private extractExperience(text: string): any[] {
    const experiences: any[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let inExperienceSection = false;
    const sectionHeaders = /^(experience|employment|work\s*history|professional\s*experience)/i;
    const otherSections = /^(education|skills|certifications|projects|awards|references|summary|objective)/i;
    const datePattern = /\b(20\d{2}|19\d{2})\s*[-–—to]+\s*(20\d{2}|19\d{2}|present|current|now)\b/i;

    let currentEntry: any = null;

    for (const line of lines) {
      if (sectionHeaders.test(line)) { inExperienceSection = true; continue; }
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
            company: '', duration: dateMatch ? dateMatch[0] : '', description: ''
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

  private extractEducation(text: string): any[] {
    const education: any[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let inEducationSection = false;
    const sectionHeader = /^(education|academic|qualification|degree)/i;
    const otherSections = /^(experience|skills|certifications|projects|awards|references|work)/i;
    const degreePattern = /\b(bachelor|master|phd|doctorate|associate|diploma|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|b\.?tech|m\.?tech|mba|b\.?e\.?)\b/i;

    for (const line of lines) {
      if (sectionHeader.test(line)) { inEducationSection = true; continue; }
      if (inEducationSection && otherSections.test(line)) break;

      if (inEducationSection && degreePattern.test(line)) {
        const yearMatch = line.match(/20\d{2}|19\d{2}/);
        education.push({ degree: line, institution: '', year: yearMatch ? yearMatch[0] : '' });
      }
    }

    return education;
  }

  private extractCertifications(text: string): string[] {
    const certs: string[] = [];
    const certPatterns = [
      /\b(AWS\s+Certified\s+[\w\s-]+)/gi,
      /\b(Azure\s+(?:Administrator|Developer|Solutions\s+Architect)[\w\s-]*)/gi,
      /\b(Google\s+Cloud\s+(?:Professional|Associate)[\w\s-]*)/gi,
      /\b(GCP\s+(?:Professional|Associate)[\w\s-]*)/gi,
      /\b(PMP|CISSP|CCNA|CCNP|CKA|CKAD|CompTIA\s+\w+)/gi,
      /\b(Scrum\s+Master|Product\s+Owner|Certified\s+Kubernetes[\w\s]*)/gi,
      /\b(Certified\s+Data\s+(?:Engineer|Scientist|Analyst)[\w\s]*)/gi,
    ];

    for (const pattern of certPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const cert = match[1].trim();
        if (!certs.includes(cert)) certs.push(cert);
      }
    }

    return certs;
  }

  private extractEducationRequirements(text: string): string[] {
    const education: string[] = [];
    const textLower = text.toLowerCase();

    const degrees = [
      { pattern: /\bph\.?d|doctorate\b/i, label: "PhD" },
      { pattern: /\bmaster'?s?\b|\bmba\b|\bm\.?s\.?\b|\bm\.?tech\b|\bm\.?e\.?\b/i, label: "Master's" },
      { pattern: /\bbachelor'?s?\b|\bb\.?s\.?\b|\bb\.?a\.?\b|\bb\.?tech\b|\bb\.?e\.?\b|\bundergraduate\b/i, label: "Bachelor's" },
      { pattern: /\bassociate'?s?\b|\bdiploma\b/i, label: "Associate's" },
    ];

    for (const { pattern, label } of degrees) {
      if (pattern.test(textLower)) education.push(label);
    }

    return education;
  }

  /**
   * Extract meaningful keywords from JD text.
   * Prioritizes longer, job-specific words and filters stop words.
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\W+/);

    const freq: Record<string, number> = {};
    for (const word of words) {
      if (word.length < 3) continue;
      if (STOP_WORDS.has(word)) continue;
      if (/^\d+$/.test(word)) continue;
      freq[word] = (freq[word] || 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])   // sort by frequency
      .slice(0, 50)
      .map(([word]) => word);
  }

  private extractName(lines: string[], email: string, phone: string, fileName?: string): string {
    const isNameLike = (s: string): boolean => {
      const words = s.trim().split(/\s+/);
      if (words.length < 2 || words.length > 4) return false;
      return words.every(w => /^[A-Za-z'-]+$/.test(w) && w.length >= 2);
    };

    const toTitleCase = (s: string): string =>
      s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    const isNotJobTitle = (s: string): boolean => {
      const l = s.toLowerCase();
      const titleWords = ['manager', 'engineer', 'developer', 'analyst', 'director', 'specialist',
        'technician', 'coordinator', 'consultant', 'administrator', 'professional', 'certified',
        'architect', 'designer', 'lead', 'senior', 'junior', 'intern', 'associate', 'officer',
        'project', 'management', 'network', 'field', 'pmp', 'safe', 'scrum', 'agile'];
      return titleWords.filter(t => l.includes(t)).length === 0;
    };

    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/:\s+\S/.test(trimmed) && !trimmed.includes('|')) continue;

      const segments = trimmed.split(/[|·•\t]/).map(s => s.trim()).filter(s => s.length > 0);
      const firstSeg = segments[0];

      if (firstSeg) {
        let candidate = firstSeg
          .replace(/\+?\d[\d\s().-]{8,}/, '')
          .replace(/\b[A-Za-z0-9._%+-]+@\S+/, '')
          .replace(/,\s*[A-Z]{2}\b.*$/, '')
          .replace(/,.*$/, '')
          .replace(/\b\d{5,}\b.*$/, '')
          .trim();

        const origWords = candidate.split(/\s+/).filter(w =>
          /^[A-Za-z'-]+$/.test(w) && w.length >= 2 && w.length <= 12
        );

        if (origWords.length >= 2 && origWords.length <= 4) {
          const nameCandidate = origWords.join(' ');
          if (isNotJobTitle(nameCandidate)) {
            if (/^[A-Z\s'-]+$/.test(nameCandidate)) return toTitleCase(nameCandidate);
            if (isNameLike(nameCandidate)) return nameCandidate;
          }
        }
      }
    }

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
      if (techTerms.filter(t => l.toLowerCase().includes(t)).length >= 2) return true;
      if (!isNotJobTitle(l)) return true;
      return false;
    };

    const mixedCasePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/;
    for (const line of lines) {
      const trimmed = line.trim();
      if (nonNameLine(trimmed)) continue;
      if (mixedCasePattern.test(trimmed)) return trimmed;
    }

    const allCapsPattern = /^[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+){1,3}$/;
    for (const line of lines) {
      const trimmed = line.trim();
      if (nonNameLine(trimmed)) continue;
      if (allCapsPattern.test(trimmed) && trimmed.length <= 40) return toTitleCase(trimmed);
    }

    for (const line of lines.slice(0, 15)) {
      const trimmed = line.trim();
      if (nonNameLine(trimmed)) continue;
      if (isNameLike(trimmed)) return trimmed;
    }

    if (fileName) {
      let baseName = fileName.replace(/\.[^.]+$/, '').replace(/^resume_\d+_/, '');
      const underscoreSegments = baseName.split('_');
      let nameSegment = underscoreSegments[0].trim().replace(/\s*\(\d+\)\s*/g, '').trim();
      const words = nameSegment.split(/\s+/).filter(w => /^[a-zA-Z'-]+$/.test(w) && w.length >= 2);
      if (words.length >= 2 && words.length <= 4) {
        const nameFromFile = words.map(w =>
          (/[a-z]/.test(w) && /[A-Z]/.test(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
        if (isNotJobTitle(nameFromFile)) return nameFromFile;
      }
    }

    if (email) {
      const localPart = email.split('@')[0];
      const nameParts = localPart.split(/[._-]/).filter(p => p.length > 1 && /^[a-zA-Z]+$/.test(p));
      if (nameParts.length >= 2) {
        return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }

    if (fileName) {
      let baseName = fileName.replace(/\.[^.]+$/, '').replace(/^resume_\d+_/, '');
      const nameSegment = baseName.split('_')[0].replace(/\s*\(\d+\)\s*/g, '').trim();
      const words = nameSegment.split(/\s+/).filter(w => /^[a-zA-Z'-]+$/.test(w) && w.length >= 2);
      if (words.length >= 1 && words.length <= 4) {
        return words.map(w =>
          (/[a-z]/.test(w) && /[A-Z]/.test(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
      }
    }

    return 'Unknown';
  }

  /**
   * Parse JD text to categorise extracted skills as required vs preferred.
   * Looks for section headers like "Required Skills", "Must Have", "Preferred", "Nice to Have".
   * Skills not found in any section default to required.
   */
  parseRequiredPreferredSkills(jdText: string, allSkills: string[]): { required: string[]; preferred: string[] } {
    type Section = 'required' | 'preferred';
    let currentSection: Section = 'required';
    const REQUIRED_MARKER = /^(required|must.?have|minimum qualif|mandatory|essential|technical requirements?|hard requirements?|core requirements?)/i;
    const PREFERRED_MARKER = /^(preferred|nice.?to.?have|bonus|desired|good to have|additional|optional|advantageous|plus|would be)/i;
    const skillMap = new Map<string, Section>();

    for (const line of jdText.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (t.length < 100) {
        if (REQUIRED_MARKER.test(t)) { currentSection = 'required'; continue; }
        if (PREFERRED_MARKER.test(t)) { currentSection = 'preferred'; continue; }
      }
      for (const skill of allSkills) {
        const sl = skill.toLowerCase();
        const re = sl.length <= 3
          ? new RegExp(`(?<![a-zA-Z0-9])${escapeRegex(sl)}(?![a-zA-Z0-9])`, 'i')
          : new RegExp(escapeRegex(sl), 'i');
        if (re.test(t)) {
          if (!skillMap.has(skill) || currentSection === 'required') {
            skillMap.set(skill, currentSection);
          }
        }
      }
    }

    const required: string[] = [];
    const preferred: string[] = [];
    for (const skill of allSkills) {
      (skillMap.get(skill) === 'preferred' ? preferred : required).push(skill);
    }
    return { required, preferred };
  }

  /**
   * Compute a 32-char SHA-256 hex hash of resume text for duplicate detection.
   * Normalises whitespace so minor formatting differences don't cause false misses.
   */
  computeTextHash(text: string): string {
    return createHash('sha256')
      .update(text.trim().replace(/\s+/g, ' '))
      .digest('hex')
      .slice(0, 32);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default new ParserService();
