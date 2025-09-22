import mongoose, { Schema, Document } from 'mongoose';

export interface ICandidate extends Document {
  jobId: mongoose.Types.ObjectId;
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
  };
  experience: Array<{
    title: string;
    company: string;
    duration: string;
    description: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
  skills: string[];
  certifications: string[];
  score: {
    overall: number;
    skillMatch: number;
    experienceMatch: number;
    educationMatch: number;
    keywordMatch: number;
  };
  improvements: string[];
  status: 'new' | 'shortlisted' | 'hold' | 'rejected';
  resumePath: string;
  rawText: string;
  fileName: string;
  createdAt: Date;
  updatedAt: Date;
}

const CandidateSchema: Schema = new Schema({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  personalInfo: {
    name: String,
    email: String,
    phone: String,
    location: String
  },
  experience: [{
    title: String,
    company: String,
    duration: String,
    description: String
  }],
  education: [{
    degree: String,
    institution: String,
    year: String
  }],
  skills: [String],
  certifications: [String],
  score: {
    overall: { type: Number, default: 0 },
    skillMatch: { type: Number, default: 0 },
    experienceMatch: { type: Number, default: 0 },
    educationMatch: { type: Number, default: 0 },
    keywordMatch: { type: Number, default: 0 }
  },
  improvements: [String],
  status: {
    type: String,
    enum: ['new', 'shortlisted', 'hold', 'rejected'],
    default: 'new'
  },
  resumePath: String,
  rawText: String,
  fileName: String
}, {
  timestamps: true
});

export default mongoose.model<ICandidate>('Candidate', CandidateSchema);