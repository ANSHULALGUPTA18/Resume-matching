import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Candidate } from '../../services/candidateService';

interface Props {
  candidate: Candidate;
  onStatusChange: (candidateId: string, newStatus: string) => void;
}

// Generate consistent avatar color from name
const AVATAR_COLORS = [
  '#7C3AED', // purple
  '#DC2626', // red
  '#059669', // green
  '#2563EB', // blue
  '#D97706', // amber
  '#DB2777', // pink
  '#0891B2', // cyan
  '#65A30D', // lime
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'NA';
}

const BACKEND_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'http://localhost:5000';

const CandidateCard: React.FC<Props> = ({ candidate, onStatusChange }) => {
  const score = candidate.score?.overall || 0;
  const name  = candidate.personalInfo?.name || 'Unknown';
  const email = candidate.personalInfo?.email || '';
  const yoe   = candidate.extractedData?.yearsOfExperience;

  const resumeUrl = candidate.resumePath
    ? `${BACKEND_URL}/uploads/resumes/${candidate.resumePath.split(/[\\/]/).pop()}`
    : null;

  const scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  const statusBadge = {
    shortlisted: { bg: '#DCFCE7', text: '#15803D', label: 'Shortlisted' },
    hold:        { bg: '#FEF9C3', text: '#92400E', label: 'On Hold' },
    rejected:    { bg: '#FEE2E2', text: '#B91C1C', label: 'Rejected' },
    new:         { bg: '#F3F4F6', text: '#374151', label: 'New' },
  }[candidate.status] ?? { bg: '#F3F4F6', text: '#374151', label: candidate.status };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-4">

        {/* Left: avatar + info */}
        <div className="flex-1 min-w-0">
          {/* Avatar row */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: avatarColor(name) }}
            >
              {initials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
                {yoe != null && yoe > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-blue-50 text-blue-600 whitespace-nowrap flex-shrink-0">
                    {yoe} yr{yoe !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">{email || 'No email'}</p>
            </div>
          </div>

          {/* Skills */}
          <div className="flex flex-wrap gap-1 mb-2">
            {candidate.skills?.slice(0, 4).map((skill, i) => (
              <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                {skill}
              </span>
            ))}
            {candidate.skills && candidate.skills.length > 4 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                +{candidate.skills.length - 4} more
              </span>
            )}
          </div>

          {/* Improvements */}
          {candidate.improvements && candidate.improvements.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-600 mb-1">Area for improvement:</p>
              <ul className="space-y-0.5">
                {candidate.improvements.slice(0, 2).map((imp, i) => (
                  <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {resumeUrl && (
              <a
                href={resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 text-xs font-semibold rounded border transition-colors flex items-center gap-1"
                style={{ borderColor: '#6B7280', color: '#374151', backgroundColor: 'transparent' }}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View
              </a>
            )}
            {candidate.status !== 'shortlisted' && (
              <button
                onClick={() => onStatusChange(candidate._id, 'shortlisted')}
                className="px-3 py-1 text-xs font-semibold rounded text-white transition-colors"
                style={{ backgroundColor: '#3B82F6' }}
              >
                Shortlisted
              </button>
            )}
            {candidate.status !== 'hold' && (
              <button
                onClick={() => onStatusChange(candidate._id, 'hold')}
                className="px-3 py-1 text-xs font-semibold rounded text-white transition-colors"
                style={{ backgroundColor: '#F59E0B' }}
              >
                Hold
              </button>
            )}
            {candidate.status !== 'rejected' && (
              <button
                onClick={() => onStatusChange(candidate._id, 'rejected')}
                className="px-3 py-1 text-xs font-semibold rounded border transition-colors"
                style={{ borderColor: '#EF4444', color: '#EF4444', backgroundColor: 'transparent' }}
              >
                Reject
              </button>
            )}
          </div>
        </div>

        {/* Right: score circle + status badge */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <div style={{ width: 80, height: 80 }}>
            <CircularProgressbar
              value={score}
              text={`${score}%`}
              styles={buildStyles({
                pathColor: scoreColor,
                textColor: '#1F2937',
                trailColor: '#E5E7EB',
                textSize: '22px',
              })}
            />
          </div>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}
          >
            {statusBadge.label}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CandidateCard;
