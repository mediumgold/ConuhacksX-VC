// Dynamic configuration that reads from ngrok-urls.json if available
let ngrokConfig: { serverUrl?: string; clientUrl?: string } = {};

// Try to load ngrok URLs if they exist
if (typeof window === 'undefined') {
  // Server-side (Node.js)
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'ngrok-urls.json');
    if (fs.existsSync(configPath)) {
      ngrokConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    // Ignore errors, will use defaults
  }
} else {
  // Client-side (Browser)
  try {
    const stored = sessionStorage.getItem('ngrok-config');
    if (stored) {
      ngrokConfig = JSON.parse(stored);
    }
  } catch (e) {
    // Ignore errors, will use defaults
  }
}

// Export configuration
export const SERVER_URL = ngrokConfig.serverUrl || 'http://localhost:3001';
export const CLIENT_URL = ngrokConfig.clientUrl || 'http://localhost:3000';

// Helper to update config at runtime
export function updateNgrokConfig(serverUrl: string, clientUrl: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('ngrok-config', JSON.stringify({ serverUrl, clientUrl }));
  }
}
