import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface InterviewQuestion {
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  skill_tested: string;
}

interface InterviewPrepResponse {
  technical: InterviewQuestion[];
  project_based: InterviewQuestion[];
  scenario_based: InterviewQuestion[];
  behavioral: InterviewQuestion[];
  coding_or_system_design: InterviewQuestion[];
}

/**
 * Extract key information from resume text
 */
function extractKeyInfo(resumeText: string): string {
  // Simple extraction - can be enhanced with more sophisticated parsing
  const lines = resumeText.toLowerCase();
  
  // Extract common skills
  const skills: string[] = [];
  const techKeywords = ['react', 'node', 'angular', 'vue', 'python', 'java', 'javascript', 'typescript', 
    'sql', 'mongodb', 'express', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ml', 'machine learning',
    'tensorflow', 'pytorch', 'django', 'flask', 'spring', 'git', 'ci/cd'];
  
  techKeywords.forEach(keyword => {
    if (lines.includes(keyword)) {
      skills.push(keyword);
    }
  });

  return `Candidate key skills: ${skills.join(', ')}`;
}

/**
 * Generate interview questions using OpenAI API
 */
export async function generateInterviewQuestions(
  jobDescription: string,
  resumeText: string
): Promise<InterviewPrepResponse> {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key') {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
    }

    const keyInfo = extractKeyInfo(resumeText);
    
    const prompt = `You are a senior technical interviewer and hiring manager with 15+ years of experience conducting real software engineering interviews.

Your task is to generate highly personalized interview questions AND strong model answers based strictly on the candidate's resume and the job description.

Follow these strict rules:

- Questions must be specific to the candidate's skills, tools, and projects
- Avoid generic or textbook questions
- Focus on practical, real-world engineering knowledge
- Answers must sound like strong interview responses
- Keep answers concise (4–6 lines max)
- Use clear professional language
- Do NOT invent fake experiences not present in the resume
- Do NOT add explanations outside JSON
- Return ONLY valid JSON

Using BOTH the job description and the candidate resume, generate a complete interview preparation set.

You must create questions that test the EXACT technologies, projects, and responsibilities mentioned.

Generate:

- 5 technical questions
- 3 project-based questions
- 3 real-world scenario questions
- 3 behavioral questions
- 2 coding or system design questions

For EACH item include:
- question
- answer (strong model answer, 4–6 lines)
- difficulty (easy | medium | hard)
- skill_tested

Guidelines:

TECHNICAL:
Deep knowledge of required tech stack

PROJECT:
Ask specifically about candidate's real projects/experience

SCENARIO:
"What would you do if…" practical production issues

BEHAVIORAL:
Ownership, teamwork, communication, deadlines

CODING_OR_SYSTEM_DESIGN:
API design, backend architecture, scalability, algorithms

Return EXACT JSON in this structure:

{
  "technical": [
    {
      "question": "",
      "answer": "",
      "difficulty": "",
      "skill_tested": ""
    }
  ],
  "project_based": [],
  "scenario_based": [],
  "behavioral": [],
  "coding_or_system_design": []
}

JOB DESCRIPTION:
${jobDescription}

${keyInfo}

CANDIDATE RESUME:
${resumeText}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert technical interviewer. Generate personalized interview questions based on the candidate\'s resume and job description. Return ONLY valid JSON without any markdown formatting or code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error('No content received from OpenAI');
    }

    // Clean up response - remove markdown code blocks if present
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const interviewQuestions: InterviewPrepResponse = JSON.parse(cleanedContent);
    
    return interviewQuestions;
  } catch (error: any) {
    console.error('Error generating interview questions:', error);
    throw new Error(`Failed to generate interview questions: ${error.message}`);
  }
}
