import React from 'react';
import Header from '../components/layout/Header';
import JobUpload from '../components/upload/JobUpload';
import ResumeUpload from '../components/upload/ResumeUpload';
import CandidateList from '../components/candidates/CandidateList';
import { useApp } from '../contexts/AppContext';
import ResumesWidget from '../components/upload/ResumesWidget';
import CheckFitButton from '../components/upload/CheckFitButton';

const Dashboard: React.FC = () => {
  const { currentJob, candidates } = useApp();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Upload Section (unchanged) */}
          <div className="lg:col-span-1 space-y-6">
            <JobUpload />
            <ResumeUpload />
            
            {currentJob && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-3">Job Requirements</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Required Skills:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {currentJob.requirements?.skills?.map((skill, index) => (
                        <span key={index} className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">
                          {skill}
                        </span>
                      )) || <span className="text-sm text-gray-500">No skills specified</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Experience:</p>
                    <p className="text-sm text-gray-600">{currentJob.requirements?.experience || 0}+ years</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Content Area (2 columns) */}
          <div className="lg:col-span-2">
            {candidates.length > 0 ? (
              <CandidateList />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <div className="max-w-md mx-auto">
                  <svg
                    className="mx-auto h-24 w-24 text-gray-400 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="text-xl font-medium text-gray-900 mb-2">No Resumes Uploaded</h3>
                  <p className="text-gray-600">
                    {currentJob 
                      ? "Upload resumes to start analyzing candidates"
                      : "Start by uploading a job description"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Resumes list and Check Fit */}
          <div className="lg:col-span-1 space-y-4">
            <ResumesWidget />
            <CheckFitButton />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
