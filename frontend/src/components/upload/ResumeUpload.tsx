import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useApp } from '../../contexts/AppContext';
import { UploadedResume } from '../../contexts/AppContext';
import toast from 'react-hot-toast';

const ResumeUpload: React.FC = () => {
  const { currentJob, addUploadedResumes } = useApp();
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!currentJob) {
      toast.error('Please upload a job description first');
      return;
    }
    setUploading(true);
    try {
      const newResumes: UploadedResume[] = acceptedFiles.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        file,
        uploadedAt: new Date().toISOString(),
      }));
      addUploadedResumes(newResumes);
      toast.success(`${acceptedFiles.length} resume(s) added. Click "Check Fit" to analyze.`);
    } catch {
      toast.error('Failed to upload resumes');
    } finally {
      setUploading(false);
    }
  }, [currentJob, addUploadedResumes]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    multiple: true,
    disabled: !currentJob || uploading,
  });

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800 mb-2">Upload Resumes</p>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border border-dashed rounded p-4 text-center mb-3 transition-colors ${
          !currentJob || uploading
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
            : isDragActive
            ? 'bg-blue-50 border-blue-400 cursor-pointer'
            : 'border-gray-300 hover:border-blue-400 bg-gray-50 cursor-pointer'
        }`}
      >
        <input {...getInputProps()} />
        <svg className="mx-auto h-8 w-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {uploading ? (
          <p className="text-xs text-gray-500">Uploading...</p>
        ) : isDragActive ? (
          <p className="text-xs text-blue-500">Drop resumes here...</p>
        ) : (
          <p className="text-xs text-gray-500 leading-tight">
            Drag and Drop a PDF file here, or click to browse
          </p>
        )}
      </div>

      {/* Disabled import button (matching Figma grey state) */}
      <button
        type="button"
        disabled
        className="w-full py-2 text-xs font-semibold rounded text-gray-400 bg-gray-200 cursor-not-allowed"
      >
        Import the PDF file
      </button>
    </div>
  );
};

export default ResumeUpload;
