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
    const scores = {
      skillMatch: this.calculateSkillMatch(candidateData.skills, jobData.requirements.skills),
      experienceMatch: this.calculateExperienceMatch(candidateData.experience, jobData.requirements.experience),
      educationMatch: this.calculateEducationMatch(candidateData.education, jobData.requirements.education),
      keywordMatch: this.calculateKeywordMatch(candidateData.rawText, jobData.keywords)
    };

    // Calculate weighted overall score
    const overall = Math.round(
      scores.skillMatch * 0.4 +
      scores.experienceMatch * 0.3 +
      scores.educationMatch * 0.15 +
      scores.keywordMatch * 0.15
    );

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

  private calculateSkillMatch(candidateSkills: string[], requiredSkills: string[]): number {
    if (!requiredSkills.length) return 100;
    
    const matchedSkills = candidateSkills.filter(skill =>
      requiredSkills.some(reqSkill => 
        skill.toLowerCase().includes(reqSkill.toLowerCase()) ||
        reqSkill.toLowerCase().includes(skill.toLowerCase())
      )
    );

    return Math.round((matchedSkills.length / requiredSkills.length) * 100);
  }

  private calculateExperienceMatch(candidateExp: any[], requiredExp: number): number {
    // Simple implementation - would need to parse experience duration
    if (!requiredExp) return 100;
    
    // For now, give a score based on number of experiences
    const estimatedYears = candidateExp.length * 2; // Rough estimate
    
    if (estimatedYears >= requiredExp) return 100;
    return Math.round((estimatedYears / requiredExp) * 100);
  }

  private calculateEducationMatch(candidateEdu: any[], requiredEdu: string[]): number {
    if (!requiredEdu.length) return 100;
    
    // Basic matching - would need more sophisticated logic
    return candidateEdu.length > 0 ? 80 : 40;
  }

  private calculateKeywordMatch(resumeText: string, keywords: string[]): number {
    if (!keywords.length) return 100;
    
    const lowerText = resumeText.toLowerCase();
    const matchedKeywords = keywords.filter(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );

    return Math.round((matchedKeywords.length / keywords.length) * 100);
  }

  private generateImprovements(
    scores: any, 
    candidateData: any, 
    jobData: IJob
  ): string[] {
    const improvements: string[] = [];

    // Skill improvements
    if (scores.skillMatch < 80) {
      const missingSkills = jobData.requirements.skills.filter(skill =>
        !candidateData.skills.some((cs: string) => 
          cs.toLowerCase().includes(skill.toLowerCase())
        )
      );
      
      if (missingSkills.length > 0) {
        improvements.push(`Missing key skills: ${missingSkills.slice(0, 3).join(', ')}`);
      }
    }

    // Experience improvements
    if (scores.experienceMatch < 80) {
      improvements.push(`Consider highlighting more relevant experience for this role`);
    }

    // Education improvements
    if (scores.educationMatch < 80 && jobData.requirements.education.length > 0) {
      improvements.push(`Education requirements may not be fully met`);
    }

    // Keyword improvements
    if (scores.keywordMatch < 70) {
      improvements.push(`Resume could benefit from more role-specific keywords`);
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

    return strengths;
  }
}

export default new ScoringService();