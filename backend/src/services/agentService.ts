/**
 * Agent Service — HTTP client for the AI Agent Server (port 5003)
 * Each method calls one agent endpoint with a timeout and graceful fallback.
 * If the agent server is down, all methods return null — the pipeline continues.
 */

import axios from 'axios';
import type { JdStructured } from '../models/Job';
import type { AgentAnalysis } from '../models/Candidate';

const AGENT_URL         = process.env.AGENT_SERVER_URL || 'http://localhost:5003';
const TIMEOUT_MS        = 30_000;   // 30s per individual agent call
const GRAPH_TIMEOUT_MS  = 120_000;  // 120s for graph pipeline (4 sequential LLM calls)

// Re-export for use in worker
export type { AgentAnalysis };
export type ResumeStructured  = NonNullable<AgentAnalysis['resumeStructured']>;
export type SkillValidation   = NonNullable<AgentAnalysis['skillValidation']>;
export type ExperienceMatch   = NonNullable<AgentAnalysis['experienceMatch']>;
export type ScoreSynthesis    = NonNullable<AgentAnalysis['synthesis']>;

async function post<T>(endpoint: string, body: object): Promise<T | null> {
  try {
    const { data } = await axios.post<T>(`${AGENT_URL}${endpoint}`, body, {
      timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    });
    return data;
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') {
      // Agent server not running — silent fallback, pipeline continues normally
    } else {
      console.warn(`Agent ${endpoint} failed: ${err.message}`);
    }
    return null;
  }
}

// ── Agent 1: JD Decomposer ────────────────────────────────────────────────────
export async function decomposeJd(jdText: string): Promise<JdStructured | null> {
  return post<JdStructured>('/agent/decompose-jd', { jd_text: jdText });
}

// ── Agent 2: Resume Intelligence ──────────────────────────────────────────────
export async function parseResume(resumeText: string): Promise<ResumeStructured | null> {
  return post<ResumeStructured>('/agent/parse-resume', { resume_text: resumeText });
}

// ── Agent 3: Technical Skills Validator ───────────────────────────────────────
export async function validateSkills(
  missingSkills: string[],
  verifiedSkills: ResumeStructured['verified_skills'],
  jdContext: Partial<JdStructured>
): Promise<SkillValidation | null> {
  if (!missingSkills.length) return null;
  return post<SkillValidation>('/agent/validate-skills', {
    missing_skills:  missingSkills,
    verified_skills: verifiedSkills,
    jd_context:      jdContext,
  });
}

// ── Agent 4: Experience Matcher ───────────────────────────────────────────────
export async function matchExperience(
  jdStructured: JdStructured,
  resumeStructured: ResumeStructured
): Promise<ExperienceMatch | null> {
  return post<ExperienceMatch>('/agent/match-experience', {
    jd_structured:     jdStructured,
    resume_structured: resumeStructured,
  });
}

// ── Agent 5: Score Synthesizer ────────────────────────────────────────────────
export async function synthesizeScore(
  keywordScore: number,
  semanticScore: number | null,
  skillValidation: SkillValidation | null,
  experienceMatch: ExperienceMatch | null,
  jdStructured: JdStructured | null
): Promise<ScoreSynthesis | null> {
  return post<ScoreSynthesis>('/agent/synthesize', {
    keyword_score:    keywordScore,
    semantic_score:   semanticScore,
    skill_validation: skillValidation,
    experience_match: experienceMatch,
    jd_structured:    jdStructured ?? {},
  });
}

// ── Phase 3: LangGraph full pipeline (Agents 2→3→4→5 in one call) ─────────────
export interface GraphPipelineResult {
  final_score:         number;
  verdict:             string;
  score_breakdown:     { skills: number; experience: number; seniority: number; domain: number };
  top_strengths:       string[];
  key_gaps:            string[];
  recruiter_note:      string;
  resume_structured:   ResumeStructured | null;
  skill_validation:    SkillValidation  | null;
  experience_match:    ExperienceMatch  | null;
  processing_path:     string;   // "full_graph" | "hybrid_fallback"
  failed_agents:       string[];
  validation_warnings: string[];
  gap_penalty_applied: number;
}

export async function runGraphPipeline(
  resumeText:       string,
  jdStructured:     JdStructured | null,
  keywordScore:     number,
  semanticScore:    number | null,
  missingRequired:  string[]
): Promise<GraphPipelineResult | null> {
  try {
    const { data } = await axios.post<GraphPipelineResult>(
      `${AGENT_URL}/agent/graph-pipeline`,
      {
        resume_text:      resumeText,
        jd_structured:    jdStructured ?? {},
        keyword_score:    keywordScore,
        semantic_score:   semanticScore,
        missing_required: missingRequired,
      },
      { timeout: GRAPH_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
    return data;
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') { /* silent */ }
    else { console.warn(`Agent /agent/graph-pipeline failed: ${err.message}`); }
    return null;
  }
}

export default { decomposeJd, parseResume, validateSkills, matchExperience, synthesizeScore, runGraphPipeline };
