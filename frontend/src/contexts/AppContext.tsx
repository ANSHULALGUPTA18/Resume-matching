import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Job } from '../services/jobService';
import { Candidate } from '../services/candidateService';

interface AppContextType {
  currentJob: Job | null;
  setCurrentJob: (job: Job | null) => void;
  candidates: Candidate[];
  setCandidates: (candidates: Candidate[]) => void;
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
  const [loading, setLoading] = useState(false);

  return (
    <AppContext.Provider
      value={{
        currentJob,
        setCurrentJob,
        candidates,
        setCandidates,
        loading,
        setLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};