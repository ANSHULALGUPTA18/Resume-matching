# 🎯 Interview Prep Feature - Setup Guide

## Prerequisites

The Interview Prep feature requires an OpenAI API key to generate personalized interview questions.

## Setup Instructions

### 1. Get Your OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to **API Keys** section
4. Click **"Create new secret key"**
5. Copy the generated key (starts with `sk-...`)

### 2. Configure Backend

1. Open the file: `backend/.env`
2. Replace the placeholder with your actual API key:

```env
OPENAI_API_KEY=sk-your-actual-api-key-here
```

⚠️ **Important**: Never commit your `.env` file with real API keys to version control!

### 3. Restart Backend Server

After updating the `.env` file, restart your backend server:

```bash
cd backend
npm run dev:watch
```

## How to Use

1. **Upload Job Description**: First, upload or paste a job description
2. **Upload Resumes**: Upload candidate resumes and get them scored
3. **Generate Interview Prep**: Click the "🎯 Interview Prep" button on any candidate card
4. **View Questions**: A modal will open with personalized questions in 5 categories:
   - Technical Questions
   - Project-Based Questions
   - Scenario Questions
   - Behavioral Questions
   - Coding/System Design Questions

## Features

✅ **Personalized Questions**: Based on candidate's actual skills and job requirements  
✅ **Model Answers**: Each question includes a strong sample answer  
✅ **Difficulty Levels**: Questions marked as easy, medium, or hard  
✅ **Skill Tags**: Shows which skill each question tests  
✅ **Show/Hide Answers**: Toggle answer visibility for practice  

## Troubleshooting

### Error: "OpenAI API key is not configured"

**Solution**: Make sure you've added your real OpenAI API key to `backend/.env` file and restarted the backend server.

### Error: "Please upload a job description first"

**Solution**: You need to upload a job description before generating interview questions. The system needs the job requirements to create relevant questions.

### Error: "Failed to generate interview questions"

**Possible causes**:
- Invalid or expired API key
- No credit balance on OpenAI account
- Network connectivity issues
- Backend server not running

**Check**:
1. Backend server console for detailed error messages
2. Browser console (F12) for frontend errors
3. Your OpenAI account has available credits

## Cost Information

The Interview Prep feature uses OpenAI's GPT-4 Turbo model:
- Approximate cost: $0.01 - $0.03 per generation
- Generates 16 questions with detailed answers per request

## API Configuration

Current settings (in `backend/src/services/interviewPrepService.ts`):
- **Model**: `gpt-4-turbo-preview`
- **Temperature**: `0.5` (balanced creativity)
- **Max Tokens**: `3000` (comprehensive responses)

You can adjust these settings based on your needs and budget.
