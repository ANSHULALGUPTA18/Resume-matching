import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentIcon } from '@heroicons/react/24/outline';
import { candidateService } from '../../services/candidateService';
import { useApp } from '../../contexts/AppContext';
import toast from 'react-hot-toast';

const ResumeUpload: React.FC = () => {
  const { currentJob, setCandidates } = useApp();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!currentJob) {
      toast.error('Please upload a job description first');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await candidateService.uploadResumes(currentJob._id, acceptedFiles);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setCandidates(response.candidates);
      toast.success(`${response.candidates.length} resume(s) processed successfully!`);
    } catch (error) {
      toast.error('Failed to upload resumes');
      console.error(error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [currentJob, setCandidates]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    multiple: true
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Upload Resumes</h2>
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${!currentJob ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}
          ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} disabled={!currentJob || uploading} />
        <DocumentIcon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
        {!currentJob ? (
          <p className="text-gray-500">Upload a job description first</p>
        ) : isDragActive ? (
          <p className="text-indigo-600">Drop the resumes here...</p>
        ) : (
          <>
            <p className="text-gray-600">
              Drag & drop resumes here, or click to select
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Supports multiple PDF, DOC, DOCX files
            </p>
          </>
        )}
        
        {uploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="mt-2 text-sm text-gray-600">Processing resumes... {uploadProgress}%</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeUpload;