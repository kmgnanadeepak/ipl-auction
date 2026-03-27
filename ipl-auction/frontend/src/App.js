import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { RoomProvider, useRoom } from './context/RoomContext';
import HomePage    from './pages/HomePage';
import LobbyPage   from './pages/LobbyPage';
import AuctionPage from './pages/AuctionPage';
import PlayersPage from './pages/PlayersPage';
import TeamsPage   from './pages/TeamsPage';
import ResultsPage from './pages/ResultsPage';

/* Only allow access to /room/* if user is in a room */
const RoomRoute = ({ children }) => {
  const { inRoom, isRestoring } = useRoom();
  if (isRestoring) return null;
  if (!inRoom) return <Navigate to="/" replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"               element={<HomePage />} />
      <Route path="/lobby"          element={<RoomRoute><LobbyPage /></RoomRoute>} />
      <Route path="/auction"        element={<RoomRoute><AuctionPage /></RoomRoute>} />
      <Route path="/players"        element={<RoomRoute><PlayersPage /></RoomRoute>} />
      <Route path="/teams"          element={<RoomRoute><TeamsPage /></RoomRoute>} />
      <Route path="/results"        element={<RoomRoute><ResultsPage /></RoomRoute>} />
      <Route path="*"               element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <RoomProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{
          style: { background:'#1F2937', color:'#F9FAFB', border:'1px solid #374151', borderRadius:'10px', fontFamily:'Inter,sans-serif', fontSize:'14px' },
          success: { iconTheme: { primary:'#FFD700', secondary:'#0A0E1A' } },
          error:   { iconTheme: { primary:'#EF4444', secondary:'#0A0E1A' } },
        }} />
      </RoomProvider>
    </Router>
  );
}
