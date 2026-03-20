import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { jobService } from '../../services/jobService';
import { candidateService } from '../../services/candidateService';
import { useApp } from '../../contexts/AppContext';
import toast from 'react-hot-toast';

const JobUpload: React.FC = () => {
  const { currentJob, setCurrentJob, setCandidates, setUploadedResumes } = useApp();
  const [company, setCompany] = useState('');
  const [mode, setMode] = useState<'upload' | 'text'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jdText, setJdText] = useState('');
  const [processing, setProcessing] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setSelectedFile(acceptedFiles[0]);
    toast.success(`Selected: ${acceptedFiles[0].name}`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
  });

  const handleImport = async () => {
    try {
      setProcessing(true);
      if (mode === 'upload') {
        if (!selectedFile) { toast.error('Please select a file'); return; }
        const response = await jobService.uploadJD(selectedFile, company);
        setCurrentJob(response.job);
        toast.success('Job description uploaded successfully!');
      } else {
        if (!jdText.trim()) { toast.error('Please enter job description text'); return; }
        const response = await jobService.importText(jdText, {
          company: company || undefined,
          title: jobTitle || undefined,
          fileName: 'manual-input.txt',
        });
        setCurrentJob(response.job);
        toast.success('Job description imported successfully!');
      }
    } catch {
      toast.error('Failed to import job description');
    } finally {
      setProcessing(false);
    }
  };

  const handleNewJob = async () => {
    // Delete all candidates for the current job from DB
    if (currentJob?._id) {
      try {
        await candidateService.deleteByJob(currentJob._id);
      } catch {
        // Non-blocking — reset UI regardless
      }
    }
    setCurrentJob(null);
    setCandidates([]);
    setUploadedResumes([]);
    setSelectedFile(null);
    setCompany('');
    setJobTitle('');
    setJdText('');
  };

  const canImport = mode === 'upload' ? !!selectedFile : !!jdText.trim();

  // ── After JD is uploaded: show job details ──────────────────────
  if (currentJob) {
    return (
      <div>
        {/* New Job button */}
        <button
          onClick={handleNewJob}
          className="w-full mb-4 py-1.5 text-xs font-semibold rounded border text-center transition-colors"
          style={{ borderColor: '#3B82F6', color: '#3B82F6', backgroundColor: 'white' }}
        >
          + New Job description
        </button>

        {/* Job description heading */}
        <p className="text-sm font-semibold text-gray-800 mb-3">Job description</p>

        {/* Company Name */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">Company Name</p>
          <div className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50 text-gray-700">
            {currentJob.company || '—'}
          </div>
        </div>

        {/* Title */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">Title</p>
          <p className="text-xs text-gray-600">{currentJob.title || '—'}</p>
        </div>

        {/* Description preview */}
        {currentJob.description && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Descriptions</p>
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-4">
              {currentJob.description}
            </p>
          </div>
        )}

        {/* Job Requirements */}
        {((currentJob.requirements?.skills?.length ?? 0) > 0 || (currentJob.requirements?.experience ?? 0) > 0) && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">Job Requirements</p>

            {/* Skills */}
            {(currentJob.requirements?.skills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {(currentJob.requirements?.skills ?? []).slice(0, 10).map((skill, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 bg-white"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

            {/* Experience */}
            {(currentJob.requirements?.experience ?? 0) > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Experience: {currentJob.requirements?.experience}+ years
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Before JD uploaded: upload form ─────────────────────────────
  return (
    <div>
      <p className="text-sm font-semibold text-gray-800 mb-2">Job description</p>

      {/* Tabs — underline style */}
      <div className="flex mb-3 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className="flex-1 py-1.5 text-xs font-medium transition-colors"
          style={mode === 'upload'
            ? { color: '#3B82F6', borderBottom: '2px solid #3B82F6', marginBottom: '-1px', backgroundColor: 'transparent' }
            : { color: '#6B7280', borderBottom: '2px solid transparent', marginBottom: '-1px', backgroundColor: 'transparent' }}
        >
          Upload PDF
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className="flex-1 py-1.5 text-xs font-medium transition-colors"
          style={mode === 'text'
            ? { color: '#3B82F6', borderBottom: '2px solid #3B82F6', marginBottom: '-1px', backgroundColor: 'transparent' }
            : { color: '#6B7280', borderBottom: '2px solid transparent', marginBottom: '-1px', backgroundColor: 'transparent' }}
        >
          Write Manually
        </button>
      </div>

      {/* Company Name */}
      <p className="text-xs font-semibold text-gray-800 mb-1">Company Name</p>
      <input
        type="text"
        value={company}
        onChange={e => setCompany(e.target.value)}
        placeholder="Enter the company name here"
        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded mb-3 focus:outline-none focus:ring-1 focus:border-blue-400"
      />

      {mode === 'upload' ? (
        <>
          <div
            {...getRootProps()}
            className={`border border-dashed rounded p-4 text-center cursor-pointer mb-3 transition-colors ${
              isDragActive ? 'bg-blue-50 border-blue-400' : 'border-gray-300 hover:border-blue-400 bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <svg className="mx-auto h-8 w-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {selectedFile ? (
              <p className="text-xs text-gray-700 font-medium">{selectedFile.name}</p>
            ) : (
              <p className="text-xs text-gray-500 leading-tight">
                Drag &amp;Drop a job description here ,or<br />click to select supports PDF, DOC, DOCX,<br />TXT
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={processing || !canImport}
            className="w-full py-2 text-xs font-semibold rounded text-white transition-colors"
            style={{ backgroundColor: processing || !canImport ? '#9CA3AF' : '#3B82F6' }}
          >
            {processing ? 'Importing...' : 'Import JD'}
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            placeholder="Job title (optional)"
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded mb-2 focus:outline-none"
          />
          <textarea
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            rows={5}
            placeholder="Paste or write the job description here..."
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded mb-3 focus:outline-none resize-none"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={processing || !canImport}
            className="w-full py-2 text-xs font-semibold rounded text-white transition-colors"
            style={{ backgroundColor: processing || !canImport ? '#9CA3AF' : '#3B82F6' }}
          >
            {processing ? 'Importing...' : 'Import JD'}
          </button>
        </>
      )}
    </div>
  );
};

export default JobUpload;
