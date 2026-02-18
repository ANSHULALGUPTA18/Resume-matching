import { IJob } from '../models/Job';
import { ICandidate } from '../models/Candidate';

interface ScoreBreakdown {
  overall: number;
  skillMatch: number;
  experienceMatch: number;
  educationMatch: number;
  keywordMatch: number;
}

interface ScoringResult {
  score: ScoreBreakdown;
  improvements: string[];
  strengths: string[];
}

class ScoringService {
  calculateScore(candidateData: any, jobData: IJob): ScoringResult {
    const candidateSkills = Array.isArray(candidateData.skills) ? candidateData.skills : [];
    const rawText = typeof candidateData.rawText === 'string' ? candidateData.rawText : '';
    const candidateExperience = Array.isArray(candidateData.experience) ? candidateData.experience : [];
    const candidateEducation = Array.isArray(candidateData.education) ? candidateData.education : [];

    const requiredSkills = Array.isArray(jobData.requirements?.skills) ? jobData.requirements.skills : [];
    const requiredExperience = typeof jobData.requirements?.experience === 'number' ? jobData.requirements.experience : 0;
    const requiredEducation = Array.isArray(jobData.requirements?.education) ? jobData.requirements.education : [];
    const jobKeywords = Array.isArray(jobData.keywords) ? jobData.keywords : [];

    const scores = {
      skillMatch: this.calculateSkillMatch(candidateSkills, requiredSkills),
      experienceMatch: this.calculateExperienceMatch(candidateExperience, requiredExperience, rawText),
      educationMatch: this.calculateEducationMatch(candidateEducation, requiredEducation, rawText),
      keywordMatch: this.calculateKeywordMatch(rawText, jobKeywords)
    };

    // Calculate weighted overall score (weights sum to 1.0)
    const overall = Math.min(100, Math.max(0, Math.round(
      scores.skillMatch * 0.4 +
      scores.experienceMatch * 0.3 +
      scores.educationMatch * 0.15 +
      scores.keywordMatch * 0.15
    )));

    const improvements = this.generateImprovements(scores, candidateData, jobData);
    const strengths = this.identifyStrengths(scores, candidateData, jobData);

    return {
      score: {
        overall,
        ...scores
      },
      improvements,
      strengths
    };
  }

  /**
   * Skill matching: count how many REQUIRED skills the candidate has.
   * Uses deduplicated matching — each required skill can only be matched once.
   * Score = (matched required skills / total required skills) * 100, capped at 100.
   */
  private calculateSkillMatch(candidateSkills: string[], requiredSkills: string[]): number {
    if (!requiredSkills.length) return 0;
    if (!candidateSkills.length) return 0;

    const candidateLower = candidateSkills.map(s => s.toLowerCase().trim());

    let matchedCount = 0;
    for (const reqSkill of requiredSkills) {
      const reqLower = reqSkill.toLowerCase().trim();
      if (!reqLower) continue;

      const isMatched = candidateLower.some(cs =>
        cs === reqLower ||
        cs.includes(reqLower) ||
        reqLower.includes(cs)
      );

      if (isMatched) {
        matchedCount++;
      }
    }

    return Math.min(100, Math.round((matchedCount / requiredSkills.length) * 100));
  }

  /**
   * Experience matching: extract years from resume text using regex patterns,
   * then compare against required experience.
   */
  private calculateExperienceMatch(candidateExp: any[], requiredExp: number, rawText: string): number {
    if (!requiredExp || requiredExp <= 0) return 100;

    // Try to extract years of experience from resume text
    let estimatedYears = 0;

    if (rawText) {
      // Look for explicit "X years of experience" patterns
      const yearPatterns = [
        /(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|exp)/gi,
        /experience\s*(?:of\s+)?(\d+)\+?\s*years?/gi,
        /(\d+)\+?\s*years?\s*(?:in|working|professional)/gi,
      ];

      const allMatches: number[] = [];
      for (const pattern of yearPatterns) {
        let match;
        while ((match = pattern.exec(rawText)) !== null) {
          allMatches.push(parseInt(match[1], 10));
        }
      }

      if (allMatches.length > 0) {
        // Take the maximum years mentioned
        estimatedYears = Math.max(...allMatches);
      } else {
        // Fallback: estimate from date ranges (e.g., "2018 - 2023")
        const dateRanges = rawText.match(/20\d{2}\s*[-–—to]+\s*(20\d{2}|present|current)/gi);
        if (dateRanges && dateRanges.length > 0) {
          const currentYear = new Date().getFullYear();
          let totalYears = 0;
          for (const range of dateRanges) {
            const years = range.match(/20(\d{2})/g);
            if (years && years.length >= 2) {
              totalYears += parseInt(years[1]) - parseInt(years[0]);
            } else if (years && years.length === 1 && /present|current/i.test(range)) {
              totalYears += currentYear - parseInt(years[0]);
            }
          }
          estimatedYears = Math.max(estimatedYears, totalYears);
        }

        // Second fallback: count experience entries (rough estimate, 1.5 years each)
        if (estimatedYears === 0 && candidateExp.length > 0) {
          estimatedYears = Math.round(candidateExp.length * 1.5);
        }
      }
    }

    if (estimatedYears >= requiredExp) return 100;
    return Math.min(100, Math.max(0, Math.round((estimatedYears / requiredExp) * 100)));
  }

  /**
   * Education matching: check if resume text mentions required degree levels.
   */
  private calculateEducationMatch(candidateEdu: any[], requiredEdu: string[], rawText: string): number {
    if (!requiredEdu.length) return 100;

    const textLower = (rawText || '').toLowerCase();

    // Degree level hierarchy for matching
    const degreePatterns: Record<string, string[]> = {
      'phd': ['ph.d', 'phd', 'doctorate', 'doctor of philosophy'],
      'master': ['master', 'msc', 'm.s.', 'mba', 'm.b.a', 'mtech', 'm.tech', 'ma ', 'm.a.'],
      'bachelor': ['bachelor', 'bsc', 'b.s.', 'btech', 'b.tech', 'ba ', 'b.a.', 'be ', 'b.e.', 'undergraduate'],
      'associate': ['associate', 'diploma'],
    };

    let matchedCount = 0;
    for (const req of requiredEdu) {
      const reqLower = req.toLowerCase();

      // Direct text match
      if (textLower.includes(reqLower)) {
        matchedCount++;
        continue;
      }

      // Check degree level patterns
      for (const [, patterns] of Object.entries(degreePatterns)) {
        const reqMatchesDegree = patterns.some(p => reqLower.includes(p));
        const textMatchesDegree = patterns.some(p => textLower.includes(p));
        if (reqMatchesDegree && textMatchesDegree) {
          matchedCount++;
          break;
        }
      }
    }

    return Math.min(100, Math.max(0, Math.round((matchedCount / requiredEdu.length) * 100)));
  }

  /**
   * Keyword matching: check how many job keywords appear in the resume text.
   * Only counts unique matches.
   */
  private calculateKeywordMatch(resumeText: string, keywords: string[]): number {
    if (!keywords.length) return 0;
    if (!resumeText) return 0;

    const lowerText = resumeText.toLowerCase();
    const matchedKeywords = new Set<string>();

    for (const keyword of keywords) {
      const kw = keyword.toLowerCase().trim();
      if (kw && lowerText.includes(kw)) {
        matchedKeywords.add(kw);
      }
    }

    return Math.min(100, Math.round((matchedKeywords.size / keywords.length) * 100));
  }

  private generateImprovements(
    scores: any,
    candidateData: any,
    jobData: IJob
  ): string[] {
    const improvements: string[] = [];
    const candidateSkills = Array.isArray(candidateData.skills) ? candidateData.skills : [];
    const requiredSkills = Array.isArray(jobData.requirements?.skills) ? jobData.requirements.skills : [];

    // Skill improvements
    if (scores.skillMatch < 80 && requiredSkills.length > 0) {
      const candidateLower = candidateSkills.map((s: string) => s.toLowerCase());
      const missingSkills = requiredSkills.filter((skill: string) =>
        !candidateLower.some((cs: string) =>
          cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs)
        )
      );

      if (missingSkills.length > 0) {
        improvements.push(`Missing key skills: ${missingSkills.slice(0, 5).join(', ')}`);
      }
    }

    // Experience improvements
    if (scores.experienceMatch < 80) {
      improvements.push('Consider highlighting more relevant experience for this role');
    }

    // Education improvements
    if (scores.educationMatch < 80 && jobData.requirements?.education?.length > 0) {
      improvements.push('Education requirements may not be fully met');
    }

    // Keyword improvements
    if (scores.keywordMatch < 70) {
      improvements.push('Resume could benefit from more role-specific keywords');
    }

    return improvements;
  }

  private identifyStrengths(
    scores: any,
    candidateData: any,
    jobData: IJob
  ): string[] {
    const strengths: string[] = [];

    if (scores.skillMatch >= 80) {
      strengths.push('Strong skill match with job requirements');
    }

    if (scores.experienceMatch >= 80) {
      strengths.push('Relevant experience level for the position');
    }

    if (scores.keywordMatch >= 80) {
      strengths.push('Good keyword optimization');
    }

    if (scores.educationMatch >= 80) {
      strengths.push('Education requirements met');
    }

    return strengths;
  }
}

export default new ScoringService();
