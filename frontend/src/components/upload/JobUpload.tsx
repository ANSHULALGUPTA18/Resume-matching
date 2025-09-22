import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { jobService } from '../../services/jobService';
import { useApp } from '../../contexts/AppContext';
import toast from 'react-hot-toast';

const JobUpload: React.FC = () => {
  const { setCurrentJob, setLoading } = useApp();
  const [company, setCompany] = useState('');
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    
    try {
      const response = await jobService.uploadJD(file, company);
      setCurrentJob(response.job);
      toast.success('Job description uploaded successfully!');
    } catch (error) {
      toast.error('Failed to upload job description');
      console.error(error);
    } finally {
      setUploading(false);
    }
  }, [company, setCurrentJob]);

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

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Upload Job Description</h2>
      
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

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} disabled={uploading} />
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
          </>
        )}
        {uploading && (
          <div className="mt-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-sm text-gray-600">Processing...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobUpload;