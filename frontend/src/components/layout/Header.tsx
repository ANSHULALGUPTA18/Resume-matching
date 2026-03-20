import React from 'react';

const Header: React.FC = () => {
  return (
    <header style={{ backgroundColor: '#3B82F6' }} className="h-14 flex items-center px-4 shadow-md">
      <div className="flex items-center space-x-3">
        <img src="/logo.png" alt="Logo" className="h-14 w-14 rounded-full" />
        <span className="text-white font-bold text-2xl tracking-wide">Resume Matching</span>
      </div>
    </header>
  );
};

export default Header;
