import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import HostPage from './pages/HostPage';
import ClientPage from './pages/ClientPage';
import { Mic, Monitor, Users } from 'lucide-react';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-6xl font-black italic text-cyan-500 mb-4">VOCAL COMBAT</h1>
        <p className="text-xl text-yellow-500 mb-12">MULTIPLAYER PITCH FIGHTER</p>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Host Button */}
          <Link
            to="/host"
            className="group bg-gradient-to-br from-cyan-600 to-cyan-800 hover:from-cyan-500 hover:to-cyan-700 p-8 rounded-2xl transition-all hover:scale-105 shadow-lg shadow-cyan-500/20"
          >
            <Monitor className="w-16 h-16 mx-auto mb-4 group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-black mb-2">HOST GAME</h2>
            <p className="text-sm text-cyan-200">
              Set up the game, load music, and display the battle on the main screen
            </p>
          </Link>

          {/* Player Button */}
          <Link
            to="/client"
            className="group bg-gradient-to-br from-yellow-600 to-yellow-800 hover:from-yellow-500 hover:to-yellow-700 p-8 rounded-2xl transition-all hover:scale-105 shadow-lg shadow-yellow-500/20"
          >
            <Mic className="w-16 h-16 mx-auto mb-4 group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-black mb-2">JOIN AS PLAYER</h2>
            <p className="text-sm text-yellow-200">
              Connect your phone/device as a microphone controller
            </p>
          </Link>
        </div>

        {/* Instructions */}
        <div className="bg-gray-900/50 rounded-xl p-6 text-left">
          <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            How to Play
          </h3>
          <ol className="space-y-2 text-gray-300 text-sm">
            <li><span className="text-cyan-500 font-bold">1.</span> Open <code className="bg-gray-800 px-2 py-1 rounded">/host</code> on the main display (TV/monitor)</li>
            <li><span className="text-cyan-500 font-bold">2.</span> Player 1 opens <code className="bg-gray-800 px-2 py-1 rounded">/client?p=1</code> on their phone</li>
            <li><span className="text-cyan-500 font-bold">3.</span> Player 2 opens <code className="bg-gray-800 px-2 py-1 rounded">/client?p=2</code> on their phone</li>
            <li><span className="text-cyan-500 font-bold">4.</span> Host loads a YouTube video and MIDI file</li>
            <li><span className="text-cyan-500 font-bold">5.</span> Both players enable mic and press Ready</li>
            <li><span className="text-cyan-500 font-bold">6.</span> Host starts the battle!</li>
          </ol>
          
          <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
            <p className="text-yellow-200 text-xs">
              <strong>Note:</strong> All devices must be on the same local network. 
              The server runs on port 3001, client on port 3000.
            </p>
          </div>
        </div>

        {/* Server Info */}
        <div className="mt-8 text-gray-500 text-sm">
          <p>Server: <code className="text-cyan-400">localhost:3001</code></p>
          <p>Client: <code className="text-cyan-400">localhost:3000</code></p>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/client" element={<ClientPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
