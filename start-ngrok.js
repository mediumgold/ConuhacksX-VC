import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchNgrokUrls() {
  return new Promise((resolve) => {
    http.get('http://localhost:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tunnels = json.tunnels;
          if (tunnels && tunnels.length > 0) {
            const clientUrl = tunnels.find(t => t.name === 'client')?.public_url || tunnels[0].public_url;
            resolve({ clientUrl, serverUrl: clientUrl });
          } else {
            resolve(null);
          }
        } catch (err) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function startNgrok() {
  try {
    console.log('Starting ngrok tunnels...\n');
    console.log('🔄 Launching ngrok with config file...\n');

    // Start ngrok using the CLI with config file (only web tunnel for free tier)
    const ngrokProcess = spawn('ngrok', ['start', 'web', '--config', path.join(__dirname, 'ngrok.yml')], {
      stdio: 'pipe',
      detached: false
    });

    ngrokProcess.stderr.on('data', (data) => {
      const error = data.toString();
      // Only show errors that aren't normal startup messages
      if (!error.includes('INF') && !error.includes('lvl=info')) {
        console.error('Ngrok error:', error);
      }
    });

    // Poll ngrok API for tunnel URLs
    let urlsSaved = false;
    const pollInterval = setInterval(async () => {
      if (urlsSaved) return;

      const urls = await fetchNgrokUrls();
      if (urls) {
        console.log('\n✅ Ngrok tunnels started successfully!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📱 MOBILE ACCESS URLS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n🖥️  Host UI:      ${urls.clientUrl}/host`);
        console.log(`🎤 Player 1 UI:   ${urls.clientUrl}/client?p=1`);
        console.log(`🎤 Player 2 UI:   ${urls.clientUrl}/client?p=2`);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Save URLs to config files
        const config = {
          serverUrl: urls.serverUrl,
          clientUrl: urls.clientUrl,
          timestamp: new Date().toISOString()
        };

        try {
          fs.writeFileSync(
            path.join(__dirname, 'ngrok-urls.json'),
            JSON.stringify(config, null, 2)
          );

          // Create public folder if it doesn't exist
          if (!fs.existsSync(path.join(__dirname, 'public'))) {
            fs.mkdirSync(path.join(__dirname, 'public'));
          }

          fs.writeFileSync(
            path.join(__dirname, 'public', 'ngrok-urls.json'),
            JSON.stringify(config, null, 2)
          );

          console.log('💾 URLs saved to ngrok-urls.json and public/ngrok-urls.json\n');
          console.log('⚠️  Keep this terminal open to maintain the tunnels!\n');
          urlsSaved = true;
          clearInterval(pollInterval);
        } catch (err) {
          console.error('⚠️  Warning: Could not save URLs to file:', err.message);
        }
      }
    }, 2000);

    ngrokProcess.on('error', (error) => {
      console.error('❌ Failed to start ngrok:', error.message);
      console.error('\nMake sure ngrok is installed:');
      console.error('  brew install ngrok/ngrok/ngrok');
      clearInterval(pollInterval);
      process.exit(1);
    });

    ngrokProcess.on('exit', (code) => {
      clearInterval(pollInterval);
      if (code !== 0 && code !== null) {
        console.error(`\n❌ Ngrok exited with code ${code}`);
        process.exit(code);
      }
    });

    // Handle shutdown gracefully
    process.on('SIGINT', () => {
      console.log('\n\nShutting down ngrok tunnels...');
      clearInterval(pollInterval);
      ngrokProcess.kill('SIGTERM');
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });

    process.on('SIGTERM', () => {
      clearInterval(pollInterval);
      ngrokProcess.kill('SIGTERM');
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });

  } catch (error) {
    console.error('❌ Error starting ngrok:', error);
    process.exit(1);
  }
}

startNgrok();
