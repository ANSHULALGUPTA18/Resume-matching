import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface InterviewQuestion {
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  skill_tested: string;
}

interface InterviewPrepData {
  technical: InterviewQuestion[];
  project_based: InterviewQuestion[];
  scenario_based: InterviewQuestion[];
  behavioral: InterviewQuestion[];
  coding_or_system_design: InterviewQuestion[];
}

interface InterviewPrepModalProps {
  data: InterviewPrepData;
  onClose: () => void;
}

const InterviewPrepModal: React.FC<InterviewPrepModalProps> = ({ data, onClose }) => {
  const [activeTab, setActiveTab] = useState<keyof InterviewPrepData>('technical');
  const [showAnswers, setShowAnswers] = useState<{ [key: number]: boolean }>({});

  const tabs: { key: keyof InterviewPrepData; label: string }[] = [
    { key: 'technical', label: 'Technical' },
    { key: 'project_based', label: 'Project-Based' },
    { key: 'scenario_based', label: 'Scenario' },
    { key: 'behavioral', label: 'Behavioral' },
    { key: 'coding_or_system_design', label: 'Coding/Design' },
  ];

  const toggleAnswer = (index: number) => {
    setShowAnswers(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const currentQuestions = data[activeTab] || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">
            🎯 Interview Preparation Guide
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b bg-gray-50">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition ${
                  activeTab === tab.key
                    ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {tab.label}
                <span className="ml-2 text-xs bg-gray-200 px-2 py-1 rounded-full">
                  {data[tab.key]?.length || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentQuestions.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              No questions available for this category
            </div>
          ) : (
            <div className="space-y-4">
              {currentQuestions.map((item, index) => (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                >
                  {/* Question Header */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-800 flex-1 pr-4">
                      Q{index + 1}: {item.question}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getDifficultyColor(
                        item.difficulty
                      )}`}
                    >
                      {item.difficulty}
                    </span>
                  </div>

                  {/* Skill Tag */}
                  <div className="mb-3">
                    <span className="inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-sm">
                      💡 {item.skill_tested}
                    </span>
                  </div>

                  {/* Show Answer Button */}
                  <button
                    onClick={() => toggleAnswer(index)}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm mb-2"
                  >
                    {showAnswers[index] ? '▼ Hide Answer' : '▶ Show Model Answer'}
                  </button>

                  {/* Answer */}
                  {showAnswers[index] && (
                    <div className="mt-3 p-4 bg-green-50 border-l-4 border-green-500 rounded">
                      <p className="text-gray-700 leading-relaxed">{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              💡 Practice these questions to prepare for your interview
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewPrepModal;
