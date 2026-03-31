import { IJob } from '../models/Job';
import { ExtractedData, LlmFeedback, ScoreBreakdown } from '../models/Candidate';

// ── Skill alias map ────────────────────────────────────────────────────────────
const SKILL_ALIASES: Record<string, string[]> = {
  'JavaScript':        ['js', 'es6', 'es2015', 'ecmascript', 'vanilla js'],
  'TypeScript':        ['ts'],
  'Python':            ['py'],
  'Node.js':           ['node', 'nodejs'],
  'React':             ['reactjs', 'react.js'],
  'Vue':               ['vuejs', 'vue.js'],
  'Angular':           ['angularjs'],
  'Next.js':           ['nextjs'],
  'Machine Learning':  ['ml', 'statistical learning'],
  'Deep Learning':     ['dl', 'neural networks', 'neural network'],
  'NLP':               ['natural language processing'],
  'Computer Vision':   ['image recognition'],
  'Kubernetes':        ['k8s'],
  'PostgreSQL':        ['postgres', 'pg'],
  'MongoDB':           ['mongo'],
  'MySQL':             ['mariadb'],
  'Elasticsearch':     ['opensearch', 'elastic'],
  'GitHub Actions':    ['gh actions'],
  'CI/CD':             ['continuous integration', 'continuous delivery', 'devops pipeline'],
  'Microservices':     ['microservice architecture', 'service oriented'],
  'Serverless':        ['lambda functions', 'faas'],
  'GraphQL':           ['gql'],
  'REST':              ['restful', 'rest api', 'restful api'],
  'gRPC':              ['grpc', 'protocol buffers', 'protobuf'],
  'WebSocket':         ['websockets', 'ws'],
  'TensorFlow':        ['tf'],
  'PyTorch':           ['torch'],
  'HuggingFace':       ['hugging face', 'transformers library'],
  'Scikit-learn':      ['sklearn', 'scikit learn'],
  'LangChain':         ['langchain'],
  'LangGraph':         ['langgraph'],
  'LlamaIndex':        ['llama index', 'gpt index'],
  'OpenAI':            ['gpt', 'gpt-4', 'gpt-3', 'chatgpt', 'openai api'],
  'RAG':               ['retrieval augmented generation', 'retrieval-augmented'],
  'LLM':               ['large language model', 'large language models', 'foundation model'],
  'Prompt Engineering':['prompt design', 'prompt tuning'],
  'Docker':            ['containerization', 'containers'],
  'AWS':               ['amazon web services', 'amazon aws'],
  'GCP':               ['google cloud', 'google cloud platform'],
  'Azure':             ['microsoft azure'],
  'Boto3':             ['boto', 'aws sdk python'],
  'Terraform':         ['infrastructure as code', 'iac'],
  'Pandas':            ['dataframe'],
  'SQL':               ['structured query language', 'relational database'],
  'Git':               ['version control', 'source control'],
  'Linux':             ['unix', 'ubuntu', 'centos', 'debian'],
  'Kafka':             ['apache kafka', 'event streaming'],
  'Airflow':           ['apache airflow'],
  'Spark':             ['apache spark', 'pyspark'],
  'FastAPI':           ['fast api'],
  'Spring Boot':       ['springboot'],
  'Power BI':          ['powerbi'],
  'C#':                ['csharp', 'dotnet', '.net'],
  'C++':               ['cpp'],
  'ETL':               ['extract transform load', 'data pipeline'],
  'dbt':               ['data build tool'],
};

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  }
}

function normalise(skill: string): string {
  return ALIAS_TO_CANONICAL.get(skill.toLowerCase().trim()) ?? skill;
}

function candidateHasSkill(req: string, candidateSkills: string[], resumeText: string): boolean {
  const reqLower = req.toLowerCase().trim();
  const reqCanon = normalise(req).toLowerCase();

  for (const cs of candidateSkills) {
    const csLower = cs.toLowerCase().trim();
    const csCanon = normalise(cs).toLowerCase();
    if (csLower === reqLower) return true;
    if (csLower.includes(reqLower) || reqLower.includes(csLower)) return true;
    if (csCanon === reqCanon) return true;
  }

  const aliases = SKILL_ALIASES[req] || [];
  const textLower = resumeText.toLowerCase();
  if (aliases.some(a => textLower.includes(a.toLowerCase()))) return true;
  if (textLower.includes(reqLower)) return true;
  if (reqCanon !== reqLower && textLower.includes(reqCanon)) return true;

  return false;
}

// ── Education level hierarchy ──────────────────────────────────────────────────
const EDU_LEVEL: Record<string, number> = {
  'none': 0, 'associate': 1, 'bachelor': 2, 'master': 3, 'phd': 4
};

const EDU_REQUIRED_LEVEL: Record<string, number> = {
  "Associate's": 1, "Bachelor's": 2, "Master's": 3, "PhD": 4
};

// ── Phase 1: Hard Filter ───────────────────────────────────────────────────────

export interface HardFilterResult {
  passed: boolean;
  reason?: string;
  experiencePenalty: number;  // 0 = no penalty, 0-1 = multiplier applied to final score
  educationPenalty: number;
}

export function applyHardFilters(
  extractedData: ExtractedData,
  jobData: IJob
): HardFilterResult {
  const requiredExp = jobData.requirements?.experience ?? 0;
  const requiredEdu = jobData.requirements?.education ?? [];

  let experiencePenalty = 0;
  let educationPenalty = 0;
  const reasons: string[] = [];

  // Experience gate
  if (requiredExp > 0 && extractedData.yearsOfExperience !== null) {
    const candidateYears = extractedData.yearsOfExperience;
    if (candidateYears < requiredExp * 0.4) {
      // Severely underqualified: less than 40% of required experience
      experiencePenalty = 0.50;
      reasons.push(`Only ~${candidateYears}y experience vs ${requiredExp}y required`);
    } else if (candidateYears < requiredExp * 0.7) {
      // Moderately underqualified: 40–70% of requirement
      experiencePenalty = 0.20;
      reasons.push(`${candidateYears}y experience vs ${requiredExp}y required`);
    }
  }

  // Education gate
  if (requiredEdu.length > 0) {
    const reqLevel = Math.max(...requiredEdu.map(e => EDU_REQUIRED_LEVEL[e] ?? 0));
    const candidateLevel = EDU_LEVEL[extractedData.educationLevel] ?? 0;

    if (candidateLevel < reqLevel - 1) {
      // Two or more levels below requirement
      educationPenalty = 0.20;
      reasons.push(`Education below minimum requirement`);
    }
  }

  const passed = experiencePenalty < 0.50;

  return {
    passed,
    reason: reasons.length ? reasons.join('; ') : undefined,
    experiencePenalty,
    educationPenalty,
  };
}

// ── Extract structured data from resume ───────────────────────────────────────

export function extractCandidateData(candidateData: any): ExtractedData {
  const rawText: string = candidateData.rawText || '';
  const skills: string[] = candidateData.skills || [];
  const experience: any[] = candidateData.experience || [];

  // Years of experience
  let yearsOfExperience: number | null = null;
  const currentYear = new Date().getFullYear();

  const MONTHS_PAT = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';
  const PRESENT_PAT = 'present|current|now|till\\s+date|to\\s+date';

  const intervals: [number, number][] = [];
  const usedRanges = new Set<string>();

  const tryAddInterval = (fullMatch: string, startStr: string, endStr?: string) => {
    const key = fullMatch.trim().toLowerCase();
    if (usedRanges.has(key)) return;
    usedRanges.add(key);
    const startYear = parseInt(startStr, 10);
    const isPresent = !endStr || /present|current|now|till|to\s*date/i.test(endStr);
    const endYear = isPresent ? currentYear : parseInt(endStr, 10);
    if (startYear >= 1980 && endYear <= currentYear + 1 && endYear >= startYear) {
      intervals.push([startYear, endYear]);
    }
  };

  // ── Method 1: Date ranges from experience[].duration fields ONLY ──────────
  // Scans only work experience entries — education, project, and cert dates stay out
  for (const exp of experience) {
    const dur = String(exp.duration || '').trim();
    if (!dur) continue;

    // "2015 - 2018" or "2015 – Present"
    const simple = new RegExp(
      `((?:19|20)\\d{2})\\s*[-–—]\\s*(?:((?:19|20)\\d{2})|(${PRESENT_PAT}))`, 'gi'
    );
    let m: RegExpExecArray | null;
    while ((m = simple.exec(dur)) !== null) {
      tryAddInterval(m[0], m[1], m[2] || m[3]);
    }

    // "Jan 2015 – Dec 2018" or "March 2019 to Present"
    const monthYear = new RegExp(
      `(?:${MONTHS_PAT})\\.?\\s*'?((?:19|20)\\d{2})\\s*(?:[-–—]|to)\\s*` +
      `(?:(?:${MONTHS_PAT})\\.?\\s*'?((?:19|20)\\d{2})|(${PRESENT_PAT}))`, 'gi'
    );
    while ((m = monthYear.exec(dur)) !== null) {
      tryAddInterval(m[0], m[1], m[2] || m[3]);
    }
  }

  // ── Merge overlapping intervals (prevents double-counting parallel jobs) ──
  let calculatedYears: number | null = null;
  if (intervals.length > 0) {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
      const last = merged[merged.length - 1];
      if (intervals[i][0] <= last[1]) {
        last[1] = Math.max(last[1], intervals[i][1]);
      } else {
        merged.push(intervals[i]);
      }
    }
    const total = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
    if (total > 0 && total <= 50) calculatedYears = total;
  }

  // ── Method 2: Explicit statements in full text (fallback) ─────────────────
  // Only used when experience entries have no parseable duration strings
  const explicitMatches: number[] = [];
  if (calculatedYears === null) {
    const explicitPatterns = [
      /(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|exp)/gi,
      /experience\s*(?:of\s+)?(\d+)\+?\s*years?/gi,
    ];
    for (const pattern of explicitPatterns) {
      let match;
      while ((match = pattern.exec(rawText)) !== null) {
        const val = parseInt(match[1], 10);
        if (val >= 1 && val <= 40) explicitMatches.push(val);
      }
    }
  }

  if (calculatedYears !== null) {
    yearsOfExperience = calculatedYears;
  } else if (explicitMatches.length > 0) {
    yearsOfExperience = Math.max(...explicitMatches);
  } else if (experience.length > 0) {
    // Last resort: rough estimate from number of experience entries
    yearsOfExperience = Math.round(experience.length * 1.5);
  }

  // Education level
  const textLower = rawText.toLowerCase();
  let educationLevel: ExtractedData['educationLevel'] = 'none';
  if (/\bph\.?d|doctorate\b/i.test(textLower)) educationLevel = 'phd';
  else if (/\bmaster'?s?\b|\bmba\b|\bm\.?s\.?\b|\bm\.?tech\b|\bmeng\b/i.test(textLower)) educationLevel = 'master';
  else if (/\bbachelor'?s?\b|\bb\.?s\.?\b|\bb\.?a\.?\b|\bb\.?tech\b|\bb\.?e\.?\b|\bundergraduate\b/i.test(textLower)) educationLevel = 'bachelor';
  else if (/\bassociate'?s?\b|\bdiploma\b/i.test(textLower)) educationLevel = 'associate';

  // Job titles from experience entries
  const jobTitles = experience
    .map((e: any) => e.title || e.company || '')
    .filter(Boolean)
    .slice(0, 5);

  return {
    yearsOfExperience,
    educationLevel,
    skillsList: skills.map(s => normalise(s)),
    jobTitles,
  };
}

// ── Phase 2: Keyword skill match ───────────────────────────────────────────────

interface SkillMatchResult {
  score: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedPreferred: string[];
  missingPreferred: string[];
}

function calculateSkillMatchDetailed(
  candidateSkills: string[],
  requiredSkills: string[],
  preferredSkills: string[],
  rawText: string
): SkillMatchResult {
  const matchedRequired: string[] = [];
  const missingRequired: string[] = [];
  const matchedPreferred: string[] = [];
  const missingPreferred: string[] = [];

  for (const req of requiredSkills) {
    (candidateHasSkill(req, candidateSkills, rawText) ? matchedRequired : missingRequired).push(req);
  }
  for (const pref of preferredSkills) {
    (candidateHasSkill(pref, candidateSkills, rawText) ? matchedPreferred : missingPreferred).push(pref);
  }

  if (requiredSkills.length === 0 && preferredSkills.length === 0) {
    return { score: 0, matchedRequired, missingRequired, matchedPreferred, missingPreferred };
  }

  const reqScore  = requiredSkills.length  > 0 ? (matchedRequired.length  / requiredSkills.length)  * 100 : 100;
  const prefScore = preferredSkills.length > 0 ? (matchedPreferred.length / preferredSkills.length) * 100 : 50;
  const score = preferredSkills.length > 0
    ? Math.round(reqScore * 0.70 + prefScore * 0.30)
    : Math.round(reqScore);

  return { score: Math.min(100, score), matchedRequired, missingRequired, matchedPreferred, missingPreferred };
}

function calculateExperienceMatch(extractedData: ExtractedData, requiredExp: number): number {
  if (!requiredExp || requiredExp <= 0) return 50;
  const years = extractedData.yearsOfExperience ?? 0;
  if (years >= requiredExp) return 100;
  return Math.min(100, Math.max(0, Math.round((years / requiredExp) * 100)));
}

function calculateEducationMatch(extractedData: ExtractedData, requiredEdu: string[], rawText: string): number {
  if (!requiredEdu.length) return 50;
  const textLower = rawText.toLowerCase();
  const degreePatterns: Record<string, string[]> = {
    'phd':      ['ph.d', 'phd', 'doctorate'],
    'master':   ['master', 'msc', 'm.s.', 'mba', 'm.tech', 'meng'],
    'bachelor': ['bachelor', 'bsc', 'b.s.', 'btech', 'b.tech', 'undergraduate'],
    'associate':['associate', 'diploma'],
  };
  let matchedCount = 0;
  for (const req of requiredEdu) {
    const reqLower = req.toLowerCase();
    if (textLower.includes(reqLower)) { matchedCount++; continue; }
    for (const [, patterns] of Object.entries(degreePatterns)) {
      if (patterns.some(p => reqLower.includes(p)) && patterns.some(p => textLower.includes(p))) {
        matchedCount++; break;
      }
    }
  }
  return Math.min(100, Math.max(0, Math.round((matchedCount / requiredEdu.length) * 100)));
}

function calculateKeywordMatch(resumeText: string, keywords: string[]): number {
  if (!keywords.length || !resumeText) return 0;
  const lower = resumeText.toLowerCase();
  const matched = new Set<string>();
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (k && lower.includes(k)) matched.add(k);
  }
  return Math.min(100, Math.round((matched.size / keywords.length) * 100));
}

// ── Main scoring interface ─────────────────────────────────────────────────────

interface ScoringResult {
  score: {
    overall: number;
    skillMatch: number;
    experienceMatch: number;
    educationMatch: number;
    keywordMatch: number;
  };
  improvements: string[];
  strengths: string[];
  extractedData: ExtractedData;
  scoreBreakdown: ScoreBreakdown;
}

class ScoringService {

  /**
   * Phase 1+2 keyword scoring — always available, no embedding server needed.
   * Returns base scores + extractedData for use in later phases.
   */
  calculateScore(candidateData: any, jobData: IJob): ScoringResult {
    const candidateSkills: string[] = candidateData.skills || [];
    const rawText: string = candidateData.rawText || '';
    const requiredSkills: string[]  = (jobData.requirements as any)?.requiredSkills ?? jobData.requirements?.skills ?? [];
    const preferredSkills: string[] = (jobData.requirements as any)?.preferredSkills ?? [];
    const requiredExp: number = jobData.requirements?.experience ?? 0;
    const requiredEdu: string[] = jobData.requirements?.education || [];
    const jobKeywords: string[] = jobData.keywords || [];

    const extractedData = extractCandidateData(candidateData);
    const hardFilter = applyHardFilters(extractedData, jobData);

    const skillMatchResult = calculateSkillMatchDetailed(candidateSkills, requiredSkills, preferredSkills, rawText);
    const skillMatch = skillMatchResult.score;
    const experienceMatch = calculateExperienceMatch(extractedData, requiredExp);
    const educationMatch  = calculateEducationMatch(extractedData, requiredEdu, rawText);
    const keywordMatch    = calculateKeywordMatch(rawText, jobKeywords);

    let overall = Math.min(100, Math.max(0, Math.round(
      skillMatch * 0.40 + experienceMatch * 0.30 + educationMatch * 0.15 + keywordMatch * 0.15
    )));

    // Apply hard filter penalties
    const penalty = hardFilter.experiencePenalty + hardFilter.educationPenalty;
    if (penalty > 0) {
      overall = Math.round(overall * (1 - Math.min(penalty, 0.60)));
    }

    const scoreBreakdown: ScoreBreakdown = {
      hardFilterPassed:      hardFilter.passed,
      hardFilterReason:      hardFilter.reason,
      skillMatchScore:       skillMatch,
      sectionSemanticScore:  null,
      llmScore:              null,
      finalScore:            overall,
      experiencePenalty:     hardFilter.experiencePenalty,
      educationPenalty:      hardFilter.educationPenalty,
      matchedRequired:       skillMatchResult.matchedRequired,
      missingRequired:       skillMatchResult.missingRequired,
      matchedPreferred:      skillMatchResult.matchedPreferred,
      missingPreferred:      skillMatchResult.missingPreferred,
    };

    return {
      score: { overall, skillMatch, experienceMatch, educationMatch, keywordMatch },
      improvements: this.generateImprovements(
        { skillMatch, experienceMatch, educationMatch, keywordMatch },
        candidateData, jobData, hardFilter, skillMatchResult.missingRequired
      ),
      strengths: this.identifyStrengths(
        { skillMatch, experienceMatch, educationMatch, keywordMatch }
      ),
      extractedData,
      scoreBreakdown,
    };
  }

  /**
   * Phase 3+4 hybrid scoring — call this AFTER base scoring when embeddings + LLM are available.
   * Blends: skillMatch×0.35 + sectionSemantic×0.40 + llm×0.25 (or fills missing layer).
   */
  calculateHybridScore(
    baseSkillScore: number,
    sectionSemanticScore: number | null,
    llmScoreValue: number | null,
    extractedData: ExtractedData,
    jobData: IJob,
    existingBreakdown: ScoreBreakdown
  ): { finalScore: number; scoreBreakdown: ScoreBreakdown } {

    let finalScore: number;
    const experiencePenalty = existingBreakdown.experiencePenalty ?? 0;
    const educationPenalty  = existingBreakdown.educationPenalty  ?? 0;
    const totalPenalty = Math.min(experiencePenalty + educationPenalty, 0.60);

    if (sectionSemanticScore !== null && llmScoreValue !== null) {
      // All three layers: skill×0.35 + section×0.40 + llm×0.25
      finalScore = Math.round(
        baseSkillScore * 0.35 + sectionSemanticScore * 0.40 + llmScoreValue * 0.25
      );
    } else if (sectionSemanticScore !== null) {
      // No LLM: skill×0.35 + section×0.65
      finalScore = Math.round(baseSkillScore * 0.35 + sectionSemanticScore * 0.65);
    } else if (llmScoreValue !== null) {
      // No section embeddings: skill×0.50 + llm×0.50
      finalScore = Math.round(baseSkillScore * 0.50 + llmScoreValue * 0.50);
    } else {
      finalScore = baseSkillScore;
    }

    // Re-apply Phase 1 hard filter penalties — must carry through to hybrid score
    if (totalPenalty > 0) {
      finalScore = Math.round(finalScore * (1 - totalPenalty));
    }

    finalScore = Math.min(100, Math.max(0, finalScore));

    const scoreBreakdown: ScoreBreakdown = {
      ...existingBreakdown,
      sectionSemanticScore,
      llmScore: llmScoreValue,
      finalScore,
    };

    return { finalScore, scoreBreakdown };
  }

  private generateImprovements(
    scores: any, candidateData: any, jobData: IJob, hardFilter: HardFilterResult, missingRequired?: string[]
  ): string[] {
    const improvements: string[] = [];
    const candidateSkills: string[] = candidateData.skills || [];
    const rawText: string = candidateData.rawText || '';
    const requiredSkills: string[] = jobData.requirements?.skills || [];

    if (hardFilter.reason) {
      improvements.push(`Hard filter: ${hardFilter.reason}`);
    }

    if (scores.skillMatch < 80 && requiredSkills.length > 0) {
      const missing = missingRequired ?? requiredSkills.filter(s => !candidateHasSkill(s, candidateSkills, rawText));
      if (missing.length > 0) {
        improvements.push(`Missing key skills: ${missing.slice(0, 5).join(', ')}`);
      }
    }

    if (scores.experienceMatch < 80 && (jobData.requirements?.experience ?? 0) > 0) {
      improvements.push(`Role requires ${jobData.requirements.experience}+ years — highlight relevant tenure`);
    }

    if (scores.educationMatch < 80 && (jobData.requirements?.education?.length ?? 0) > 0) {
      improvements.push('Education requirements may not be fully met');
    }

    if (scores.keywordMatch < 70) {
      improvements.push('Resume needs more role-specific keywords from the job description');
    }

    return improvements;
  }

  private identifyStrengths(scores: any): string[] {
    const strengths: string[] = [];
    if (scores.skillMatch >= 80)      strengths.push('Strong skill match with job requirements');
    if (scores.experienceMatch >= 80) strengths.push('Meets or exceeds experience requirements');
    if (scores.keywordMatch >= 80)    strengths.push('Good keyword alignment with the job description');
    if (scores.educationMatch >= 80)  strengths.push('Education requirements met');
    return strengths;
  }
}

export default new ScoringService();
