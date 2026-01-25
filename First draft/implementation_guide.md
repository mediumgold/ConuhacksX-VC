# Karaoke Fighter - Technical Specification & Implementation Guide

## 1. Project Overview

**Karaoke Fighter** is a multiplayer karaoke fighting game that combines YouTube karaoke videos with a Street Fighter-style battle system. Two players use their iPhones as microphones, and their singing performance (measured by pitch stability) determines attack damage in a real-time Phaser.js fighting game.

### Core Concept
- **Host Device (Laptop)**: Displays YouTube karaoke video, synchronized lyrics, and Phaser fighting scene
- **Player Devices (2 iPhones)**: Capture microphone audio, compute pitch stability scores, stream to host
- **Quarter System**: Song is split into 4 equal quarters that alternate ATTACK/DEFEND roles
- **Damage Calculation**: Attacker's pitch score (0-1) determines damage dealt per tick
- **Win Condition**: First player to reduce opponent's HP to 0

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HOST (Laptop Browser)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   YouTube    │  │   Lyrics     │  │   Phaser.js  │  │
│  │   Player     │  │   Display    │  │   Fighter    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                         ▲                                │
│                         │ WebSocket (Socket.io)          │
└─────────────────────────┼────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                │   Node.js Server   │
                │   (Express + WS)   │
                └─────────┬─────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│  iPhone P1 Mic   │          │  iPhone P2 Mic   │
│  /mic?p=1        │          │  /mic?p=2        │
│                  │          │                  │
│  • Mic Capture   │          │  • Mic Capture   │
│  • Pitch Detect  │          │  • Pitch Detect  │
│  • Score Stream  │          │  • Score Stream  │
└──────────────────┘          └──────────────────┘
```

### Data Flow
1. iPhones continuously analyze microphone input → compute pitch stability score (0-1)
2. Scores streamed via WebSocket to server every ~100ms
3. Server forwards scores to host client
4. Host determines current quarter → identifies attacker
5. Attack tick fires every 500ms → applies damage based on attacker's latest score
6. Phaser scene plays animations and updates HP bars

---

## 3. Tech Stack

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Server** | Node.js + Express | Fast, event-driven, WebSocket support |
| **WebSockets** | Socket.io | Simplified real-time bidirectional communication |
| **Frontend** | Vanilla HTML/CSS/JS | Minimal dependencies, hackathon speed |
| **Game Engine** | Phaser 3 | 2D canvas framework, built-in animations |
| **Video Player** | YouTube IFrame API | No audio ripping, reliable playback |
| **Lyrics Format** | LRC (Lyric RC) | Timestamp-synced lyrics standard |
| **Audio Analysis** | Web Audio API | Browser-native pitch detection |
| **HTTPS Tunnel** | ngrok | Required for iPhone microphone access |

---

## 4. Project Structure

```
karaoke-fighter/
├── server/
│   ├── package.json          # Dependencies: express, socket.io
│   └── index.js              # WebSocket server, static file serving
├── client/
│   ├── host.html             # Main display UI
│   ├── mic.html              # iPhone microphone client
│   ├── style.css             # Dark theme styling
│   ├── host.js               # Host logic (YouTube, quarters, attacks)
│   ├── mic.js                # Mic logic (pitch detection, streaming)
│   ├── shared.js             # Utilities (YouTube parser, LRC parser)
│   └── phaserScene.js        # Phaser game scene (fighters, HP, animations)
├── assets/
│   ├── bg.png                # Fighting arena background
│   ├── p1.png                # Player 1 sprite sheet (80x80 frames)
│   └── p2.png                # Player 2 sprite sheet (80x80 frames)
└── lyrics/
    └── sample.lrc            # Example timestamped lyrics file
```

---

## 5. Component Specifications

### 5.1 Server (`server/index.js`)

**Responsibilities:**
- Serve static client files
- Route `/host` → `host.html`, `/mic` → `mic.html`
- Manage WebSocket connections for host and 2 mic clients
- Forward score messages from mics to host
- Track connection status

**Key Socket Events:**
| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `registerHost` | client → server | `{}` | Host registers itself |
| `hostRegistered` | server → client | `{ok: true}` | Confirm host registration |
| `registerMic` | client → server | `{player: 1\|2}` | Mic client registers |
| `micRegistered` | server → client | `{ok, player}` | Confirm mic registration |
| `score` | mic → server | `{player, score}` | Pitch score update |
| `score` | server → host | `{player, score}` | Forwarded score |
| `micStatus` | server → host | `{player, connected}` | Mic connect/disconnect |

**Implementation Notes:**
- Store `hostSocketId` to know where to forward scores
- Use `socket.data.player` to track which player each mic is
- Handle disconnections gracefully (notify host)

---

### 5.2 Host Client (`client/host.html` + `host.js`)

**UI Sections:**
1. **Top Bar:** YouTube URL input, load/start buttons, time display, quarter indicator, turn label
2. **Mic Status:** Connection indicators (✅/❌) + live score displays
3. **Left Panel:** LRC lyrics paste/upload area, YouTube player embed
4. **Right Panel:** Phaser fighting scene
5. **Bottom Bar:** Current lyric line display (synced to playback time)

**Core Logic Flow:**

#### YouTube Integration
- Extract video ID from pasted URL (supports `youtu.be/<id>`, `youtube.com/watch?v=<id>`)
- Load YouTube IFrame API
- Create player instance in `#player` div
- Retrieve `duration` from player on ready
- Poll `getCurrentTime()` every frame (requestAnimationFrame)

#### Lyrics System
- Accept LRC format: `[mm:ss.xx] lyric text`
- Parse into array of `{t: secondsFloat, text}` objects
- Find current lyric by comparing playback time to timestamps
- Display active lyric in bottom bar

#### Quarter System
```javascript
// Split song into 4 equal quarters based on YouTube duration
const quarterDuration = duration / 4;
const currentQuarter = Math.floor(currentTime / quarterDuration) + 1; // 1-4

// Determine roles
const isP1Attack = (currentQuarter === 1 || currentQuarter === 3);
const isP2Attack = (currentQuarter === 2 || currentQuarter === 4);
```

#### Attack Tick System
- Start interval on "Start Fight" button press
- Fire every **500ms** while game is active
- On each tick:
  1. Determine current attacker based on quarter
  2. Get attacker's latest score from WebSocket
  3. Calculate damage: `base (3) + bonus (12) * score`
  4. Call `phaserScene.doAttack({attacker, score})`
  5. Update HP and check for KO

**Start Conditions:**
- YouTube video loaded AND duration retrieved
- LRC lyrics loaded AND parsed successfully
- Both microphones connected
- User clicks "Start Fight" button

---

### 5.3 Microphone Client (`client/mic.html` + `mic.js`)

**Responsibilities:**
- Request microphone permission
- Continuously analyze audio input
- Compute pitch stability score (0-1 scale)
- Stream score to server via WebSocket

**URL Parameters:**
- `?p=1` → Player 1 (red)
- `?p=2` → Player 2 (blue)

**Pitch Detection Algorithm:**
```javascript
// Simplified approach (needs Web Audio API implementation)
1. Request getUserMedia({audio: true})
2. Connect to AnalyserNode + ScriptProcessorNode
3. Every 100ms:
   a. Get frequency data (FFT)
   b. Find dominant frequency (peak detection)
   c. Check frequency stability over 3-5 samples
   d. Compute score:
      - 1.0 = perfect stable pitch
      - 0.5 = some pitch variation
      - 0.0 = no clear pitch / silence
4. Emit score via socket: {player, score}
```

**UI Requirements:**
- Large display showing:
  - Player number (P1 or P2)
  - Connection status
  - Live score visualization (progress bar or waveform)
  - "Sing to Attack!" prompt
- Simple, mobile-optimized layout (large tap targets)

**Critical Requirement:**
- **MUST use HTTPS** (iPhone requires secure context for getUserMedia)
- Use `ngrok http 5173` to create HTTPS tunnel
- Access via `https://<random>.ngrok.io/mic?p=1`

---

### 5.4 Shared Utilities (`client/shared.js`)

#### `extractYouTubeId(url)`
Supports multiple URL formats:
- `https://youtu.be/dQw4w9WgXcQ`
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `https://www.youtube.com/embed/dQw4w9WgXcQ`

Returns video ID string or `null` if invalid.

#### `parseLRC(lrcText)`
Parses LRC format:
```
[00:12.50] First line of lyrics
[00:15.30] Second line of lyrics
[01:05.00] Chorus starts here
```

Returns sorted array: `[{t: 12.5, text: "First line..."}, ...]`

**Note:** Original implementation has regex syntax error on line 250 - needs fixing.

#### `currentLyricAtTime(lines, t)`
Binary search or linear scan to find active lyric at time `t`.
Returns text string of current line.

---

### 5.5 Phaser Scene (`client/phaserScene.js`)

**Configuration:**
- Canvas size: 800×450px
- Background color: #000000
- Parent: `#phaserMount` div

**Assets:**
- `bg.png` - Arena background (800×450 recommended)
- `p1.png` - Player 1 sprite sheet (80×80 frame size, multiple frames)
- `p2.png` - Player 2 sprite sheet (80×80 frame size, multiple frames)

**Sprite Animations:**
| Animation | Frames | Use Case |
|-----------|--------|----------|
| `p1-idle` | 0-3 | Default standing pose |
| `p1-punch` | 4-7 | Attacking animation |
| `p1-hit` | 8-11 | Taking damage |
| `p1-block` | 12-15 | Blocking weak attack |

(Same for P2 with `p2-*` prefix)

**HP Bar System:**
- Position: Top-left (P1) and top-right (P2)
- Max width: 300px, Height: 18px
- Background: #222222 (dark gray)
- Fill: #ff0000 (red)
- Updates via `updateBars()` based on current HP (0-100)

**Damage Calculation:**
```javascript
const base = 3;        // Minimum damage per tick
const bonus = 12;      // Max bonus damage
let damage = base + bonus * score;

// Blocking mechanic (poor singing)
if (score < 0.35) {
  blocked = true;
  damage *= 0.4;      // 60% damage reduction
}
```

**Visual Feedback:**
- Camera shake on hit (stronger shake for score > 0.8)
- Play punch animation on attacker
- Play hit/block animation on defender
- Display "KO" text when HP reaches 0

**Exposed API:**
- `doAttack({attacker, score})` - Called by host.js every tick
- `updateBars()` - Refreshes HP bar visuals
- `gameOver` - Boolean flag to prevent attacks after KO

---

## 6. Key Implementation Details

### 6.1 Quarter-Based Turn System

The song duration is divided into 4 equal segments:

| Quarter | Time Range | P1 Role | P2 Role |
|---------|------------|---------|---------|
| 1 | 0% - 25% | ATTACK | DEFEND |
| 2 | 25% - 50% | DEFEND | ATTACK |
| 3 | 50% - 75% | ATTACK | DEFEND |
| 4 | 75% - 100% | DEFEND | ATTACK |

**Implementation:**
```javascript
const quarterDuration = totalDuration / 4;
const currentQuarter = Math.floor(currentTime / quarterDuration) + 1;
const attacker = (currentQuarter === 1 || currentQuarter === 3) ? 1 : 2;
```

**UI Indicator:**
- Display current quarter: "Quarter 1/4"
- Show turn status: "P1 ATTACK - P2 DEFEND"

---

### 6.2 Attack Tick System

**Timing:** 500ms interval (2 attacks per second)

**Pseudo-code:**
```javascript
setInterval(() => {
  if (!gameActive || gameOver) return;

  const time = ytPlayer.getCurrentTime();
  const quarter = Math.floor(time / (duration / 4)) + 1;
  const attacker = (quarter === 1 || quarter === 3) ? 1 : 2;
  const score = attacker === 1 ? p1Score : p2Score;

  phaserScene.doAttack({ attacker, score });
}, 500);
```

**Requirements:**
- Must wait for game start (button press)
- Pause attacks if YouTube player paused
- Stop on KO or song end

---

### 6.3 Pitch Stability Scoring

**Goal:** Measure how consistently the player maintains pitch

**Approach:**
1. Use Web Audio API's `AnalyserNode` to get frequency data
2. Apply autocorrelation or FFT peak detection to find dominant frequency
3. Track frequency over sliding window (e.g., last 5 samples)
4. Calculate coefficient of variation (CV) or standard deviation
5. Map stability to 0-1 score:
   - Low variation (stable pitch) → score near 1.0
   - High variation (wobbly pitch) → score near 0.0
   - Silence / no pitch → score 0.0

**Alternative Simplified Approach:**
- Use `AnalyserNode.getByteFrequencyData()`
- Find peak frequency bin
- Check if peak amplitude > threshold (indicates singing vs silence)
- Score = (peak amplitude / 255) clamped to 0-1

---

### 6.4 LRC Lyrics Format

**Standard Format:**
```
[ar: Artist Name]
[ti: Song Title]
[00:12.50] First lyric line
[00:15.30] Second lyric line
[01:05.00] Chorus begins
```

**Timestamp Format:** `[mm:ss.xx]`
- `mm` = minutes (1-2 digits)
- `ss` = seconds (2 digits)
- `xx` = centiseconds or milliseconds (optional)

**Parser Requirements:**
- Extract all timestamp lines
- Ignore metadata tags (`[ar:`, `[ti:`, etc.)
- Convert to seconds (float)
- Sort chronologically
- Handle multiple timestamps per line (rare but valid)

---

## 7. Critical Requirements

### 7.1 HTTPS for iPhone Microphone Access

**Problem:** `getUserMedia()` requires secure context (HTTPS) on iOS

**Solution:** Use ngrok to create HTTPS tunnel

**Steps:**
1. Install ngrok: `npm install -g ngrok` or download from ngrok.com
2. Start server: `npm run dev` (runs on http://localhost:5173)
3. Create tunnel: `ngrok http 5173`
4. Use provided HTTPS URL on iPhones: `https://abc123.ngrok.io/mic?p=1`

**Important:**
- Laptop/host should access via localhost for lowest latency
- iPhones MUST use ngrok HTTPS URL
- Free ngrok URLs change on each restart (pay for static domain)

---

### 7.2 LRC Lyrics Requirement

**Hard Rule:** Game cannot start without valid LRC file

**Validation:**
- Check that `lrcLines.length > 0` after parsing
- Verify at least one timestamp is valid (not NaN)
- Disable "Start Fight" button until lyrics loaded

**User Flow:**
1. User pastes YouTube URL → loads video
2. User pastes/uploads LRC file → parses and validates
3. "Start Fight" button enables only when BOTH ready
4. Mic connections verified before game starts

---

### 7.3 YouTube Playback Constraints

**Do NOT:**
- Try to extract/download audio from YouTube (violates ToS)
- Use external audio processing on YouTube stream

**DO:**
- Use YouTube IFrame API for playback
- Sync lyrics to `getCurrentTime()` from player
- Let YouTube handle all audio/video delivery

**Challenges:**
- Network latency affects timestamp accuracy
- Ad interruptions may desync lyrics (skip ads manually or use Premium)
- Age-restricted videos won't embed (choose carefully)

---

## 8. Implementation Status Checklist

### ✅ Completed Components

- [x] Server setup (Express + Socket.io)
- [x] Server WebSocket routing (host, mics, scores)
- [x] Host HTML structure (UI layout complete)
- [x] Host CSS styling (dark theme, responsive panels)
- [x] Shared utilities (YouTube ID extraction)
- [x] LRC parser function (needs regex fix)
- [x] Phaser scene setup (game initialization)
- [x] Phaser fighters and HP bars (visual setup)
- [x] Phaser attack animations (punch/hit/block)
- [x] Damage calculation formula

### ⚠️ Incomplete Components (Need Implementation)

- [ ] **host.js** - File cuts off at line 449, missing:
  - [ ] YouTube IFrame API initialization
  - [ ] YouTube player event handlers (onReady, onStateChange)
  - [ ] Duration extraction and quarter calculation
  - [ ] Lyrics loading logic (paste + file upload)
  - [ ] LRC parsing integration
  - [ ] Current lyric display update loop
  - [ ] WebSocket score receivers (from mics)
  - [ ] Attack tick interval setup
  - [ ] Start/stop game logic
  - [ ] Microphone connection status UI updates

- [ ] **mic.js** - Completely missing:
  - [ ] URL parameter parsing (`?p=1` or `?p=2`)
  - [ ] WebSocket connection to server
  - [ ] Player registration (`registerMic` event)
  - [ ] getUserMedia() microphone request
  - [ ] Web Audio API setup (AudioContext, AnalyserNode)
  - [ ] Pitch detection algorithm
  - [ ] Score calculation (0-1 scale)
  - [ ] Score streaming loop (emit every 100ms)
  - [ ] UI updates (connection status, score display)
  - [ ] Error handling (mic denied, disconnection)

- [ ] **Shared utilities fixes:**
  - [ ] Fix regex syntax error in `parseLRC()` (line 250)
  - [ ] Test YouTube ID extraction with edge cases

- [ ] **Assets:**
  - [ ] Create/source `bg.png` (800×450 arena background)
  - [ ] Create/source `p1.png` sprite sheet (80×80 frames)
  - [ ] Create/source `p2.png` sprite sheet (80×80 frames)
  - [ ] Create `sample.lrc` with test lyrics

- [ ] **Testing:**
  - [ ] Test WebSocket message flow
  - [ ] Verify quarter switching at correct timestamps
  - [ ] Validate damage calculation accuracy
  - [ ] Test HP depletion and KO trigger
  - [ ] Check lyric sync accuracy
  - [ ] Test ngrok HTTPS on actual iPhones
  - [ ] Verify two simultaneous mic connections

---

## 9. Architecture Decisions & Rationale

### Why WebSockets (Socket.io)?
- **Real-time bidirectional** communication required for score streaming
- **Low latency** critical for responsive gameplay
- **Automatic reconnection** handles mobile network instability
- **Broadcasting** simplifies server → host score forwarding

### Why Vanilla JS instead of React/Vue?
- **Speed:** No build step, no framework learning curve
- **Simplicity:** Direct DOM manipulation easier for small scope
- **Debugging:** Fewer abstraction layers during hackathon crunch

### Why Phaser 3 for fighting game?
- **Built-in animation system** (sprite sheets, tweens)
- **Canvas rendering** performs well on most devices
- **Game loop** handles timing and frame updates
- **Physics optional** (we only need visual animations, not collision)

### Why quarters instead of real-time role switching?
- **Predictability:** Players know when they'll attack
- **Strategic depth:** Pacing matters (save energy for attack quarters)
- **Simplicity:** No complex turn detection algorithm
- **Fair:** Equal attack time for both players

### Why pitch stability vs. pitch accuracy?
- **Feasible in 24 hours:** Easier to implement than melody matching
- **Device-agnostic:** No calibration needed for different vocal ranges
- **Fun factor:** Encourages consistent singing, not just hitting notes
- **Forgiving:** Players of all skill levels can participate

---

## 10. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                         GAME LOOP                             │
└──────────────────────────────────────────────────────────────┘

[iPhone P1]                [Server]                [Host Laptop]
     │                         │                          │
     │ 1. Mic Input            │                          │
     ├─────────────────────────┼──────────────────────────┤
     │ Capture audio           │                          │
     │ Detect pitch            │                          │
     │ Calculate stability     │                          │
     │ score = 0.75            │                          │
     │                         │                          │
     │ 2. Score Stream         │                          │
     ├────────────────────────>│                          │
     │ {player: 1, score: 0.75}│                          │
     │                         │                          │
     │                         │ 3. Forward Score         │
     │                         ├─────────────────────────>│
     │                         │ {player: 1, score: 0.75} │
     │                         │                          │
     │                         │                          │ 4. Store Score
     │                         │                          │ p1Score = 0.75
     │                         │                          │
     │                         │                          │ 5. Attack Tick (500ms)
     │                         │                          ├──────┐
     │                         │                          │      │
     │                         │                          │<─────┘
     │                         │                          │ time = 45s
     │                         │                          │ duration = 180s
     │                         │                          │ quarter = 1
     │                         │                          │ attacker = P1
     │                         │                          │
     │                         │                          │ 6. Calculate Damage
     │                         │                          │ damage = 3 + 12*0.75
     │                         │                          │ damage = 12
     │                         │                          │
     │                         │                          │ 7. Apply to Phaser
     │                         │                          │ phaserScene.doAttack({
     │                         │                          │   attacker: 1,
     │                         │                          │   score: 0.75
     │                         │                          │ })
     │                         │                          │
     │                         │                          │ 8. Update Game State
     │                         │                          │ p2HP -= 12
     │                         │                          │ p2HP = 88
     │                         │                          │
     │                         │                          │ 9. Render
     │                         │                          │ • HP bar updates
     │                         │                          │ • P1 punch animation
     │                         │                          │ • P2 hit animation
     │                         │                          │ • Camera shake
     └─────────────────────────┴──────────────────────────┘

[Loop repeats every 100ms for score updates, 500ms for attacks]
```

---

## 11. Next Steps - Completing the Implementation

### Priority 1: Core Functionality
1. **Fix `shared.js` regex bug** in `parseLRC()`
   - Replace math display syntax with proper square brackets

2. **Complete `host.js`** - Add missing sections:
   - YouTube API initialization
   - Lyrics loading and parsing
   - Quarter calculation logic
   - Attack tick interval
   - WebSocket score handlers

3. **Implement `mic.js`** from scratch:
   - Basic structure (HTML + JS)
   - WebSocket connection
   - Microphone access request
   - Simple pitch detection (start with amplitude-based)
   - Score streaming

### Priority 2: Assets & Polish
4. **Create/find game assets:**
   - Background image for fighting arena
   - Sprite sheets for fighters (or use placeholder rectangles)
   - Sample LRC file for testing

5. **Test end-to-end flow:**
   - Server ↔ Host WebSocket
   - Server ↔ Mic WebSocket
   - Score streaming accuracy
   - Attack timing precision
   - HP bar updates
   - KO detection

### Priority 3: Deployment
6. **Set up ngrok for HTTPS**
   - Install and configure
   - Test on actual iPhones
   - Handle connection errors

7. **Edge case handling:**
   - Mic disconnects mid-game
   - YouTube player errors
   - Invalid LRC files
   - Network latency compensation

---

## 12. Development Setup

### Prerequisites
```bash
# Install Node.js (v18+ recommended)
node --version

# Install ngrok
npm install -g ngrok
# OR download from https://ngrok.com
```

### Installation
```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Start development server
npm run dev
```

Server runs on `http://localhost:5173`

### Creating HTTPS Tunnel
```bash
# In new terminal
ngrok http 5173

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

### Access URLs
- **Host (Laptop):** `http://localhost:5173/host`
- **Mic P1 (iPhone 1):** `https://abc123.ngrok.io/mic?p=1`
- **Mic P2 (iPhone 2):** `https://abc123.ngrok.io/mic?p=2`

---

## 13. Known Limitations & Future Enhancements

### Current Limitations
- No pitch accuracy matching (only stability)
- Fixed 4-quarter system (not configurable)
- No sound effects or background music (beyond YouTube)
- Single song per session (must reload for new song)
- No score persistence or leaderboard
- Requires manual LRC file (no auto-fetch)

### Future Enhancements
- **Melody matching:** Compare sung notes to original karaoke track
- **Power-ups:** Special moves for perfect singing streaks
- **Character selection:** Multiple fighters with unique stats
- **Multiplayer lobbies:** More than 2 players, tournament mode
- **LRC auto-fetch:** Search lyrics databases by YouTube video ID
- **Replay system:** Record and share best performances
- **Mobile host support:** Play on tablets instead of laptop

---

## 14. Troubleshooting Guide

### Microphone Not Working on iPhone
- **Check HTTPS:** Ensure using ngrok URL, not localhost
- **Permission denied:** Go to Settings → Safari → Microphone → Allow
- **iOS 16+ bug:** Try Chrome or Firefox instead of Safari

### Lyrics Not Syncing
- **Clock drift:** YouTube time may lag; add 200ms offset
- **Wrong timestamp format:** Verify `[mm:ss.xx]` format
- **Parsing error:** Check console for regex failures

### WebSocket Disconnections
- **Network instability:** Mobile data more reliable than spotty WiFi
- **Server crash:** Check terminal for errors, restart `npm run dev`
- **Socket.io version mismatch:** Ensure client/server use same version

### Low Frame Rate in Phaser
- **Canvas size too large:** Reduce to 640×360 if 800×450 lags
- **Too many sprites:** Optimize sprite sheet, reduce animations
- **Browser hardware acceleration:** Enable in browser settings

### Damage Calculation Seems Off
- **Score not updating:** Check WebSocket messages in Network tab
- **Wrong attacker:** Verify quarter calculation logic
- **Attack tick timing:** Ensure 500ms interval firing correctly

---

## 15. Technical Glossary

| Term | Definition |
|------|------------|
| **LRC** | Lyric RC format - text file with timestamped lyrics `[mm:ss.xx]` |
| **Pitch Stability** | Consistency of sung frequency over time window |
| **Attack Tick** | 500ms interval during which damage is calculated and applied |
| **Quarter** | One of 4 equal time segments of the song (25% each) |
| **Score** | Float 0-1 representing pitch stability (1 = perfect) |
| **ngrok** | Tunneling service to create HTTPS URL for localhost |
| **getUserMedia** | Web API to access microphone/camera |
| **Socket.io** | WebSocket library with auto-reconnection and fallbacks |
| **Phaser** | HTML5 game framework for 2D canvas games |
| **YouTube IFrame API** | JavaScript API to control embedded YouTube players |
| **AnalyserNode** | Web Audio API node for frequency/waveform analysis |
| **Sprite Sheet** | Single image containing multiple animation frames |

---

## 16. Code Organization Best Practices

### File Separation Strategy
- **server/**: Pure Node.js, no browser APIs
- **client/**: Pure browser code, no Node.js modules
- **shared.js**: Functions usable by both host and mic clients
- **phaserScene.js**: Isolated game logic (no DOM dependencies)

### Naming Conventions
- **Socket events:** camelCase (e.g., `registerHost`, `micStatus`)
- **DOM IDs:** camelCase (e.g., `ytUrl`, `p1Score`)
- **CSS classes:** kebab-case (e.g., `.top-bar`, `.lyrics-line`)
- **Phaser assets:** lowercase (e.g., `bg`, `p1`, `p2`)

### Error Handling
- **Always validate:** Check if variables exist before using
- **User-friendly errors:** Show alerts/messages on critical failures
- **Console logging:** Use `console.log()` for debugging flow
- **Graceful degradation:** Game should not crash if one mic disconnects

---

## Appendix: Sample LRC File

```lrc
[ar:Rick Astley]
[ti:Never Gonna Give You Up]
[00:00.00]
[00:17.50] We're no strangers to love
[00:21.80] You know the rules and so do I
[00:25.90] A full commitment's what I'm thinking of
[00:30.20] You wouldn't get this from any other guy
[00:34.80] I just wanna tell you how I'm feeling
[00:39.40] Gotta make you understand
[00:43.20] Never gonna give you up
[00:45.50] Never gonna let you down
[00:47.80] Never gonna run around and desert you
[00:52.10] Never gonna make you cry
[00:54.40] Never gonna say goodbye
[00:56.70] Never gonna tell a lie and hurt you
```

---

**Document Version:** 1.0
**Last Updated:** 2026-01-24
**Status:** Implementation in progress (60% complete)
**Project:** ConuHacks Hackathon - Karaoke Fighter
