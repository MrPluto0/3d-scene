import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import WontonMini from './pages/WontonMini.jsx';
import WontonStall from './pages/WontonStall.jsx';
import './styles.css';

// StrictMode double-invokes effects in dev — the scene module's cleanup()
// is written to make that safe (full RAF/GPU teardown).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/wonton-mini" element={<WontonMini />} />
        <Route path="/wonton-stall" element={<WontonStall />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
