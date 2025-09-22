import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
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
  fileName: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema: Schema = new Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  description: { type: String, required: true },
  requirements: {
    skills: [String],
    experience: Number,
    education: [String],
    certifications: [String]
  },
  keywords: [String],
  rawText: String,
  fileName: String
}, {
  timestamps: true
});

export default mongoose.model<IJob>('Job', JobSchema);