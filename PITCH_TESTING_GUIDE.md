# Microphone Pitch Testing Guide

## System Overview

The pitch detection system has 3 components:

1. **Mobile Client** - Captures microphone input, detects pitch, sends to server
2. **Server** - Relays pitch data from clients to host
3. **Host** - Receives pitch data, displays white dot on KaraokeHighway

## Testing Steps

### 1. Start the Application

```bash
npm run dev
```

This starts:
- Vite dev server (port 3000)
- Express server (port 3001)
- Ngrok tunnel (for mobile access)

### 2. Open Host UI

Go to: `http://localhost:3000/host`

- Load a YouTube video
- Select a MIDI file
- Load lyrics (optional)

### 3. Open Mobile Client(s)

**Option A: Same Network (requires HTTPS workaround)**
- Go to: `http://192.168.0.10:3000/client?p=1` (use your computer's IP)
- ⚠️ Microphone will be blocked unless using HTTPS or Chrome flags

**Option B: Ngrok (Recommended)**
- Wait for ngrok to start and show the URL
- Go to: `https://your-ngrok-url.ngrok-free.dev/client?p=1`
- ✅ HTTPS works, microphone access allowed

### 4. Enable Microphone on Client

1. Click "Enable Microphone" button
2. Allow microphone permission when prompted
3. You should see:
   - Microphone icon turns green
   - Volume meter shows activity when you speak
   - Pitch frequency displays (e.g., "220 Hz")

### 5. Start the Game

1. Both players click "Ready"
2. Host clicks "START BATTLE"
3. Music should start playing
4. MIDI notes should scroll from right to left

### 6. Test Pitch Detection

**What to look for:**

1. **Console Logs (Client):**
   ```
   [Client P1] Sending pitch: 220 Hz, volume: 0.123
   ```

2. **Console Logs (Server):**
   ```
   [Server] Relaying pitch from P1: 220 Hz
   ```

3. **Console Logs (Host):**
   ```
   [Host] Received pitch from P1: 220 Hz
   ```

4. **Visual Feedback (Host):**
   - White/colored dot appears on the KaraokeHighway (left side at the yellow strike line)
   - Dot moves up/down as you change pitch
   - Dot shows the frequency value inside it
   - When dot aligns with a MIDI note, the note turns GREEN and pulses

## Troubleshooting

### White Dot Not Appearing

**Check 1: Is the game started?**
- Pitch data is only sent when `gameStarted === true`
- Check client console for: `[Client] Pitch detected but game not started`

**Check 2: Is microphone enabled?**
- Look for green microphone icon on client
- Check for browser permission errors

**Check 3: Is pitch being detected?**
- Client should show pitch value (e.g., "220 Hz")
- Try humming or singing a steady note

**Check 4: Is data reaching the server?**
- Check server console for: `[Server] Relaying pitch from P1`
- If missing, client isn't sending data

**Check 5: Is host receiving data?**
- Check host console for: `[Host] Received pitch from P1`
- If missing, Socket.IO connection issue

### Microphone Access Denied

**On Mobile (HTTP):**
- Use ngrok HTTPS URL instead of local IP
- OR enable Chrome flag: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`

**On Desktop:**
- Check browser permissions
- Try a different browser

### Pitch Detection Not Working

**Low Volume:**
- Speak/sing louder
- Check device microphone settings
- Volume threshold is `rms < 0.01`

**Background Noise:**
- Test in a quieter environment
- Pitch detection requires clear audio signal

## Expected Behavior

### Scoring System

When the white dot (your pitch) aligns with a MIDI note:
- Note turns **GREEN** and pulses
- Player gains **score points**
- Opponent takes **damage**
- Accuracy within **50 cents** counts as a match

### Turn-Based Gameplay

- Song is split into 4 segments
- Player 1 sings segments 1 & 3
- Player 2 sings segments 2 & 4
- Only the attacking player's pitch is shown

## Debug Commands

### Check Pitch Detection (Client Console)
```javascript
// Force log pitch every frame
console.log('Current pitch:', currentPitch, 'Hz');
```

### Check Refs (Host Console)
```javascript
// Check if pitch refs are updating
setInterval(() => {
  console.log('P1 pitch:', p1PitchRef.current, 'P2 pitch:', p2PitchRef.current);
}, 1000);
```

## Files Modified

Added debug logging to:
- `pages/ClientPage.tsx` - Client pitch transmission
- `server/index.ts` - Server pitch relay
- `pages/HostPage.tsx` - Host pitch reception

These logs will help identify where the pitch data flow breaks.
