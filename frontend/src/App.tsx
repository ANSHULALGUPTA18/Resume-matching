import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppProvider } from './contexts/AppContext';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <AppProvider>
        <div className="min-h-screen bg-gray-100">
          <Routes>
            <Route path="/" element={<Dashboard />} />
          </Routes>
          <Toaster position="top-right" />
        </div>
      </AppProvider>
    </Router>
  );
}

export default App;