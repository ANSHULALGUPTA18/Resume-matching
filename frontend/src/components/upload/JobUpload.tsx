import React, { useCallback, useState } from 'react';

import { useDropzone } from 'react-dropzone';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { jobService } from '../../services/jobService';
import { useApp } from '../../contexts/AppContext';

import toast from 'react-hot-toast';

const JobUpload: React.FC = () => {
  const { currentJob, setCurrentJob, setLoading } = useApp();
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
      'text/plain': ['.txt']
    },
    maxFiles: 1
  });

  const handleImport = async () => {
    try {
      setProcessing(true);
      if (mode === 'upload') {
        if (!selectedFile) {
          toast.error('Please select a file to import');
          return;
        }
        const response = await jobService.uploadJD(selectedFile, company);
        setCurrentJob(response.job);
        toast.success('Job description uploaded successfully!');
      } else {
        if (!jdText.trim()) {
          toast.error('Please enter job description text');
          return;
        }
        const response = await jobService.importText(jdText, { company: company || undefined, title: jobTitle || undefined, fileName: 'manual-input.txt' });
        setCurrentJob(response.job);
        toast.success('Job description imported successfully!');
      }
    } catch (error) {
      toast.error('Failed to import job description');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {!currentJob ? (
        <>
          <h2 className="text-xl font-semibold mb-4">Job Description</h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              className={`px-4 py-2 rounded-md border ${mode === 'upload' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              onClick={() => setMode('upload')}
              type="button"
            >
              Upload PDF
            </button>
            <button
              className={`px-4 py-2 rounded-md border ${mode === 'text' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              onClick={() => setMode('text')}
              type="button"
            >
              Write Text
            </button>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter company name"
            />
          </div>

          {mode === 'upload' ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`}
            >
              <input {...getInputProps()} />
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              {isDragActive ? (
                <p className="text-indigo-600">Drop the file here...</p>
              ) : (
                <>
                  <p className="text-gray-600">
                    Drag & drop a job description here, or click to select
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Supports PDF, DOC, DOCX, TXT
                  </p>
                  {selectedFile && (
                    <p className="text-sm text-gray-700 mt-3">Selected: <span className="font-medium">{selectedFile.name}</span></p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Job Title (optional)</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Senior Frontend Engineer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Job Description Text</label>
                <textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Paste or write the job description here..."
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleImport}
            disabled={processing || (mode === 'upload' ? !selectedFile : !jdText.trim())}
            className={`mt-4 w-full flex items-center justify-center px-4 py-2 rounded-md text-white font-medium shadow-sm
              ${processing || (mode === 'upload' ? !selectedFile : !jdText.trim())
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {processing ? 'Importing...' : 'Import Job Description'}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Job Description</h2>
            <span className="text-sm text-gray-500">{currentJob.company}</span>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Title</p>
              <p className="text-gray-900">{currentJob.title}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Description</p>
              <div className="mt-1 max-h-32 overflow-y-auto p-3 bg-gray-50 border border-gray-200 rounded">
                <p className="text-sm text-gray-700 whitespace-pre-line">{currentJob.description || 'No description available'}</p>
              </div>
            </div>
            {currentJob.requirements?.skills?.length ? (
              <div>
                <p className="text-sm font-medium text-gray-700">Top Skills</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {currentJob.requirements.skills.slice(0, 8).map((skill, i) => (
                    <span key={i} className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

export default JobUpload;