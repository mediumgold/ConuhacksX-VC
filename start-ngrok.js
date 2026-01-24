import ngrok from 'ngrok';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startNgrok() {
  try {
    console.log('Starting ngrok tunnels...\n');

    // Ensure ngrok uses the project-local config file instead of the OS default
    const projectConfigPath = path.join(__dirname, 'ngrok.yml');
    process.env.NGROK_CONFIG = projectConfigPath;

    // Best-effort: clean up any existing tunnels to avoid name conflicts
    try {
      // Attempt to delete existing tunnels via ngrok local API (if running)
      const res = await fetch('http://127.0.0.1:4040/api/tunnels');
      if (res.ok) {
        const data = await res.json();
        const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
        for (const t of tunnels) {
          const delUrl = `http://127.0.0.1:4040/api/tunnels/${encodeURIComponent(t.name)}`;
          try {
            await fetch(delUrl, { method: 'DELETE' });
          } catch (_) {
            // ignore
          }
        }
      }
    } catch (_) {
      // ignore if API not available
    }

    // Also ensure any ngrok background process is terminated
    try { await ngrok.kill(); } catch (_) {}
    // small delay to allow shutdown
    await new Promise(r => setTimeout(r, 200));

    // Start tunnel for server (port 3001)
    const serverUrl = await ngrok.connect({
      addr: 3001,
      proto: 'http',
      name: 'vc-server',
      authtoken: '38ieF17TJjkWAhdpIJCWgdIE9Wy_2wEg4D8a4GckXj1czYhiT'
    });

    // Start tunnel for client (port 3000)
    const clientUrl = await ngrok.connect({
      addr: 3000,
      proto: 'http',
      name: 'vc-client',
      authtoken: '38ieF17TJjkWAhdpIJCWgdIE9Wy_2wEg4D8a4GckXj1czYhiT'
    });

    console.log('✅ Ngrok tunnels started successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 MOBILE ACCESS URLS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n🖥️  Host UI:      ${clientUrl}/host`);
    console.log(`🎤 Player 1 UI:   ${clientUrl}/client?p=1`);
    console.log(`🎤 Player 2 UI:   ${clientUrl}/client?p=2`);
    console.log(`\n🔌 Server URL:    ${serverUrl}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Write URLs to a config file for the app to use
    const config = {
      serverUrl,
      clientUrl,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
      path.join(__dirname, 'ngrok-urls.json'),
      JSON.stringify(config, null, 2)
    );

    // Also copy to public folder for Vite to serve
    fs.writeFileSync(
      path.join(__dirname, 'public', 'ngrok-urls.json'),
      JSON.stringify(config, null, 2)
    );

    console.log('💾 URLs saved to ngrok-urls.json and public/ngrok-urls.json\n');
    console.log('⚠️  Keep this terminal open to maintain the tunnels!\n');

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n\nShutting down ngrok tunnels...');
      await ngrok.kill();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error starting ngrok:', error);
    process.exit(1);
  }
}

startNgrok();
