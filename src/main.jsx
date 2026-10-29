import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import WontonMini from './pages/WontonMini.jsx';
import StallGallery from './pages/StallGallery.jsx';
import StallLive from './pages/StallLive.jsx';
import './styles.css';

// StrictMode double-invokes effects in dev — the scene modules' cleanup()
// are written to make that safe (full RAF/GPU teardown).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/wonton-mini" element={<WontonMini />} />
        <Route path="/stall" element={<StallGallery />} />
        <Route path="/stall/live" element={<StallLive />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
