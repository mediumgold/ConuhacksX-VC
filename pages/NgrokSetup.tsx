import React, { useState, useEffect } from 'react';
import { Globe, Copy, Check } from 'lucide-react';

const NgrokSetup: React.FC = () => {
  const [ngrokUrls, setNgrokUrls] = useState<{ serverUrl: string; clientUrl: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    // Try to fetch ngrok URLs from the JSON file
    const fetchNgrokUrls = async () => {
      try {
        const response = await fetch('/ngrok-urls.json');
        if (response.ok) {
          const data = await response.json();
          setNgrokUrls(data);
          // Store in sessionStorage for other components
          sessionStorage.setItem('ngrok-config', JSON.stringify(data));
        }
      } catch (err) {
        console.log('Ngrok URLs not available, using localhost');
      }
    };

    fetchNgrokUrls();
    // Poll every 5 seconds in case ngrok starts after page load
    const interval = setInterval(fetchNgrokUrls, 5000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!ngrokUrls) {
    return (
      <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Globe className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-yellow-400 mb-2">Mobile Access Not Available</h3>
            <p className="text-sm text-yellow-200 mb-3">
              To enable mobile device access, run <code className="bg-black/30 px-2 py-1 rounded">npm run ngrok</code> in a separate terminal.
            </p>
            <p className="text-xs text-yellow-300">
              Currently using localhost URLs (desktop only).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-900/30 border border-green-600 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <Globe className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-bold text-green-400 mb-2">📱 Mobile Access Enabled</h3>
          <p className="text-sm text-green-200 mb-4">
            Share these URLs with mobile devices on any network:
          </p>

          <div className="space-y-3">
            {/* Host URL */}
            <div className="bg-black/30 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 font-bold">HOST UI</span>
                <button
                  onClick={() => copyToClipboard(`${ngrokUrls.clientUrl}/host`, 'host')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  {copied === 'host' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'host' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="text-sm text-white break-all">{ngrokUrls.clientUrl}/host</code>
            </div>

            {/* Player 1 URL */}
            <div className="bg-black/30 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 font-bold">PLAYER 1</span>
                <button
                  onClick={() => copyToClipboard(`${ngrokUrls.clientUrl}/client?p=1`, 'p1')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  {copied === 'p1' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'p1' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="text-sm text-white break-all">{ngrokUrls.clientUrl}/client?p=1</code>
            </div>

            {/* Player 2 URL */}
            <div className="bg-black/30 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 font-bold">PLAYER 2</span>
                <button
                  onClick={() => copyToClipboard(`${ngrokUrls.clientUrl}/client?p=2`, 'p2')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  {copied === 'p2' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'p2' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="text-sm text-white break-all">{ngrokUrls.clientUrl}/client?p=2</code>
            </div>
          </div>

          <p className="text-xs text-green-300 mt-3">
            ✅ Players can connect from anywhere with these URLs
          </p>
        </div>
      </div>
    </div>
  );
};

export default NgrokSetup;
