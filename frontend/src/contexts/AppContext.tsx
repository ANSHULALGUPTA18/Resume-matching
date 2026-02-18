import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Job } from '../services/jobService';
import { Candidate } from '../services/candidateService';

export interface UploadedResume {
  id: string;
  fileName: string;
  file: File;
  uploadedAt: string;
}

interface AppContextType {
  currentJob: Job | null;
  setCurrentJob: (job: Job | null) => void;
  candidates: Candidate[];
  setCandidates: (candidates: Candidate[]) => void;
  updateCandidateStatus: (candidateId: string, newStatus: string) => void;
  uploadedResumes: UploadedResume[];
  setUploadedResumes: (resumes: UploadedResume[]) => void;
  addUploadedResumes: (resumes: UploadedResume[]) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [uploadedResumes, setUploadedResumes] = useState<UploadedResume[]>([]);
  const [loading, setLoading] = useState(false);

  const addUploadedResumes = (newResumes: UploadedResume[]) => {
    setUploadedResumes(prev => [...prev, ...newResumes]);
  };

  /**
   * Update a single candidate's status in the local state.
   * This ensures Header counters and filter counts re-render immediately.
   */
  const updateCandidateStatus = useCallback((candidateId: string, newStatus: string) => {
    setCandidates(prev =>
      prev.map(c =>
        c._id === candidateId ? { ...c, status: newStatus as Candidate['status'] } : c
      )
    );
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentJob,
        setCurrentJob,
        candidates,
        setCandidates,
        updateCandidateStatus,
        uploadedResumes,
        setUploadedResumes,
        addUploadedResumes,
        loading,
        setLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
