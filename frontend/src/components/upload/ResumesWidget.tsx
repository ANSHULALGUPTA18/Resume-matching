import React, { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { TrashIcon } from '@heroicons/react/24/outline';
import { useApp, UploadedResume } from '../../contexts/AppContext';
import toast from 'react-hot-toast';

const ResumesWidget: React.FC = () => {
  const { currentJob, uploadedResumes, setUploadedResumes, addUploadedResumes } = useApp();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Selection helpers ──────────────────────────────────────────
  const allSelected = uploadedResumes.length > 0 && selectedIds.size === uploadedResumes.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(uploadedResumes.map(r => r.id)));
    }
  };

  const removeResume = (resumeId: string) => {
    setUploadedResumes(uploadedResumes.filter(r => r.id !== resumeId));
    setSelectedIds(prev => { const next = new Set(prev); next.delete(resumeId); return next; });
  };

  const deleteSelected = () => {
    setUploadedResumes(uploadedResumes.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} resume(s) removed`);
  };

  // ── Drop zone ──────────────────────────────────────────────────
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!currentJob) {
      toast.error('Please upload a job description first');
      return;
    }
    const newResumes: UploadedResume[] = acceptedFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      file,
      uploadedAt: new Date().toISOString(),
    }));
    addUploadedResumes(newResumes);
    toast.success(`${acceptedFiles.length} resume(s) added. Click "Check Fit" to analyze.`);
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
    disabled: !currentJob,
  });

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="flex flex-col gap-3 h-full">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-sm font-semibold text-gray-800">
          Resumes({uploadedResumes.length})
        </p>
        <button
          onClick={() => {
            if (!currentJob) {
              toast.error('Please upload a job description first');
              return;
            }
            uploadInputRef.current?.click();
          }}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white rounded transition-colors"
          style={{ backgroundColor: '#3B82F6' }}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={e => {
            if (e.target.files && e.target.files.length > 0) {
              onDrop(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />
      </div>

      {/* ── Select All + Delete Selected toolbar (only when resumes exist) ── */}
      {uploadedResumes.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
            />
            <span className="text-xs text-gray-600">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select All'}
            </span>
          </label>

          {selectedIds.size > 0 && (
            <button
              onClick={deleteSelected}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
            >
              <TrashIcon className="h-3 w-3" />
              Delete ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {/* ── Drop zone / resume list ── */}
      {uploadedResumes.length === 0 ? (
        <div
          {...getRootProps()}
          className={`flex-1 flex flex-col items-center justify-center border border-dashed rounded-lg transition-colors cursor-pointer min-h-48 ${
            isDragActive
              ? 'bg-blue-50 border-blue-400'
              : !currentJob
              ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
              : 'bg-gray-50 border-gray-300 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <svg className="h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-xs font-medium text-gray-500 text-center px-3">
            {isDragActive ? 'Drop resumes here...' : 'Drag and Drop a PDF file here, or click to browse'}
          </p>
          <p className="text-xs text-gray-400 mt-1 text-center px-3">
            Supports PDF, DOC, DOCX, TXT
          </p>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`flex-1 min-h-0 flex flex-col border border-dashed rounded-lg overflow-hidden transition-colors ${
            isDragActive ? 'bg-blue-50 border-blue-400' : 'border-gray-200 hover:border-blue-300'
          }`}
          onClick={e => e.stopPropagation()}
        >
          <input {...getInputProps()} />
          <div className="flex-1 overflow-y-auto space-y-1 p-2">
            {uploadedResumes.map(resume => (
              <div
                key={resume.id}
                className={`flex items-center gap-2 py-1.5 px-2 rounded group transition-colors ${
                  selectedIds.has(resume.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedIds.has(resume.id)}
                  onChange={() => toggleOne(resume.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded accent-blue-500 flex-shrink-0 cursor-pointer"
                />

                <svg className="h-6 w-6 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 truncate font-medium">{resume.fileName}</p>
                  <p className="text-xs text-gray-400">
                    {formatSize(resume.file.size)}&nbsp;&nbsp;{formatDate(resume.uploadedAt)}
                  </p>
                </div>

                <button
                  onClick={e => { e.stopPropagation(); removeResume(resume.id); }}
                  className="text-gray-300 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {isDragActive && (
            <div className="text-center py-2 text-xs text-blue-500 font-medium flex-shrink-0">
              Drop to add more resumes
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResumesWidget;
