#!/usr/bin/env node
// ============================================================
// Song Pack Converter — "one song, one box"
// Usage:
//   node scripts/add-song.mjs --midi "Midi Files/APT.mid" --lyrics "Lyrics/apt.txt" \
//        --youtube "https://youtube.com/watch?v=xxxx" --title "APT." --id apt
// Options:
//   --track N        force melody track N (see --list-tracks)
//   --list-tracks    print track analysis and exit
//   --offset S       initial sync offset in seconds (default 0)
// Output: songs/<id>/song.json
// ============================================================
import fs from 'fs';
import path from 'path';

// ---------- args ----------
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { args[key] = argv[++i]; }
    else args[key] = true;
  }
}

if (!args.midi) { console.error('Missing --midi'); process.exit(1); }

// ---------- MIDI parsing (per-track, proper tempo map) ----------
function readChunk(d, p) {
  const type = String.fromCharCode(d[p], d[p+1], d[p+2], d[p+3]);
  const length = (d[p+4]<<24)|(d[p+5]<<16)|(d[p+6]<<8)|d[p+7];
  return { type, length };
}
function readVarLen(d, p) {
  let v = 0, n = 0, b;
  do { b = d[p+n]; v = (v<<7)|(b&0x7F); n++; } while (b & 0x80);
  return { value: v, bytesRead: n };
}
const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName = m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

function parseMidi(buffer) {
  const d = new Uint8Array(buffer);
  let pos = 0;
  const header = readChunk(d, pos);
  if (header.type !== 'MThd') throw new Error('Not a MIDI file');
  pos += 8;
  const numTracks = (d[pos+2]<<8)|d[pos+3];
  const ticksPerBeat = ((d[pos+4]<<8)|d[pos+5]) & 0x7FFF;
  pos += header.length;

  // Pass 1: raw events per track (ticks), collect tempo events globally
  const tempoEvents = [{ tick: 0, usPerBeat: 500000 }];
  const tracks = [];
  for (let t = 0; t < numTracks; t++) {
    const chunk = readChunk(d, pos);
    if (chunk.type !== 'MTrk') { pos += 8 + chunk.length; continue; }
    pos += 8;
    const end = pos + chunk.length;
    let tick = 0, running = 0;
    const events = [];
    let name = '';
    const channels = new Set();
    while (pos < end) {
      const dt = readVarLen(d, pos); pos += dt.bytesRead; tick += dt.value;
      let et = d[pos];
      if (et < 0x80) { et = running; } else { pos++; if (et < 0xF0) running = et; }
      const msg = et & 0xF0, ch = et & 0x0F;
      if (msg === 0x90 || msg === 0x80) {
        const note = d[pos++], vel = d[pos++];
        channels.add(ch);
        events.push({ tick, type: (msg === 0x90 && vel > 0) ? 'on' : 'off', note, vel, ch });
      } else if (msg === 0xA0 || msg === 0xB0 || msg === 0xE0) pos += 2;
      else if (msg === 0xC0 || msg === 0xD0) pos += 1;
      else if (et === 0xFF) {
        const meta = d[pos++];
        const len = readVarLen(d, pos); pos += len.bytesRead;
        if (meta === 0x51) tempoEvents.push({ tick, usPerBeat: (d[pos]<<16)|(d[pos+1]<<8)|d[pos+2] });
        if (meta === 0x03 && !name) name = String.fromCharCode(...d.slice(pos, pos + len.value)).trim();
        pos += len.value;
      } else if (et === 0xF0 || et === 0xF7) {
        const len = readVarLen(d, pos); pos += len.bytesRead + len.value;
      }
    }
    tracks.push({ index: tracks.length, name, channels, events });
  }

  // Tempo map: tick -> seconds via integration
  tempoEvents.sort((a, b) => a.tick - b.tick);
  const segs = [];
  let accSec = 0;
  for (let i = 0; i < tempoEvents.length; i++) {
    const cur = tempoEvents[i];
    if (i > 0) {
      const prev = tempoEvents[i-1];
      accSec += ((cur.tick - prev.tick) / ticksPerBeat) * (prev.usPerBeat / 1e6);
    }
    segs.push({ tick: cur.tick, sec: accSec, usPerBeat: cur.usPerBeat });
  }
  const tickToSec = tick => {
    let s = segs[0];
    for (const seg of segs) { if (seg.tick <= tick) s = seg; else break; }
    return s.sec + ((tick - s.tick) / ticksPerBeat) * (s.usPerBeat / 1e6);
  };

  // Pass 2: notes per track in seconds
  for (const tr of tracks) {
    const active = new Map();
    tr.notes = [];
    for (const e of tr.events) {
      const key = `${e.ch}:${e.note}`;
      if (e.type === 'on') active.set(key, e);
      else {
        const on = active.get(key);
        if (on) {
          const t0 = tickToSec(on.tick), t1 = tickToSec(e.tick);
          tr.notes.push({ time: t0, duration: Math.max(t1 - t0, 0.05), midiNumber: e.note, velocity: on.vel, channel: e.ch });
          active.delete(key);
        }
      }
    }
    tr.notes.sort((a, b) => a.time - b.time);
    delete tr.events;
  }
  return tracks.filter(t => t.notes.length > 0);
}

// ---------- singability scoring ----------
function analyzeTrack(tr) {
  const n = tr.notes;
  const isDrums = [...tr.channels].every(c => c === 9);
  // polyphony: fraction of notes overlapping the next note significantly
  let overlaps = 0;
  for (let i = 0; i < n.length - 1; i++) {
    if (n[i].time + n[i].duration > n[i+1].time + 0.05 && Math.abs(n[i].time - n[i+1].time) < n[i].duration) overlaps++;
  }
  const polyRatio = n.length > 1 ? overlaps / (n.length - 1) : 0;
  const inRange = n.filter(x => x.midiNumber >= 48 && x.midiNumber <= 84).length / n.length; // C3..C6 singable
  const pitches = n.map(x => x.midiNumber).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)];
  const span = n.length ? (n[n.length-1].time + n[n.length-1].duration - n[0].time) : 0;
  const nameHit = /vocal|voice|melod|lead|sing|karaoke/i.test(tr.name || '');
  let score = 0;
  if (isDrums) score -= 10000;
  if (nameHit) score += 800;
  score += inRange * 400;
  score += (1 - polyRatio) * 400;
  score += Math.min(n.length, 400);          // melody usually has many notes
  score += Math.min(span, 200);              // covers most of the song
  if (median < 45 || median > 90) score -= 300; // bass lines / piccolo
  return { ...tr, isDrums, polyRatio, inRange, median, span, nameHit, score };
}

// ---------- melody cleanup (monophonize) ----------
function monophonize(notes) {
  // group near-simultaneous starts, keep highest pitch (melody rides on top)
  const out = [];
  let i = 0;
  const sorted = [...notes].sort((a, b) => a.time - b.time || b.midiNumber - a.midiNumber);
  while (i < sorted.length) {
    let j = i;
    let best = sorted[i];
    while (j + 1 < sorted.length && sorted[j+1].time - sorted[i].time < 0.03) {
      j++;
      if (sorted[j].midiNumber > best.midiNumber) best = sorted[j];
    }
    out.push({ ...best });
    i = j + 1;
  }
  // trim overlaps
  for (let k = 0; k < out.length - 1; k++) {
    if (out[k].time + out[k].duration > out[k+1].time) {
      out[k].duration = Math.max(out[k+1].time - out[k].time, 0.05);
    }
  }
  return out;
}

// ---------- LRC ----------
function parseLrc(text) {
  const res = [];
  for (const line of text.split('\n')) {
    const m = line.match(/\[(\d+):(\d+)(?:[.:](\d+))?\]\s*(.*)/);
    if (!m) continue;
    const t = parseInt(m[1]) * 60 + parseInt(m[2]) + (m[3] ? parseInt(m[3].padEnd(2, '0').slice(0, 2)) / 100 : 0);
    const txt = m[4].trim();
    if (txt) res.push({ time: t, text: txt });
  }
  return res.sort((a, b) => a.time - b.time);
}

// ---------- YouTube id ----------
function ytId(url) {
  if (!url) return '';
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : url.trim();
}

// ============ MAIN ============
const midiBuf = fs.readFileSync(args.midi);
const tracks = parseMidi(midiBuf.buffer.slice(midiBuf.byteOffset, midiBuf.byteOffset + midiBuf.byteLength));
const analyzed = tracks.map(analyzeTrack).sort((a, b) => b.score - a.score);

console.log(`\n${path.basename(args.midi)} — ${tracks.length} tracks with notes:`);
console.log('idx  score  notes  mono%  vocal-range%  median  name');
for (const t of analyzed) {
  console.log(
    String(t.index).padStart(3),
    String(Math.round(t.score)).padStart(6),
    String(t.notes.length).padStart(6),
    `${Math.round((1 - t.polyRatio) * 100)}%`.padStart(6),
    `${Math.round(t.inRange * 100)}%`.padStart(13),
    `${noteName(t.median)}`.padStart(7),
    ` ${t.name || '(unnamed)'}${t.isDrums ? ' [drums]' : ''}${t.nameHit ? ' <== name match' : ''}`
  );
}

if (args['list-tracks']) process.exit(0);

const chosen = args.track !== undefined
  ? analyzed.find(t => t.index === parseInt(args.track))
  : analyzed[0];
if (!chosen) { console.error('Track not found'); process.exit(1); }
console.log(`\nUsing track ${chosen.index} (${chosen.name || 'unnamed'}) as the vocal melody.`);

const melody = monophonize(chosen.notes).map(n => ({
  time: Math.round(n.time * 1000) / 1000,
  duration: Math.round(n.duration * 1000) / 1000,
  midiNumber: n.midiNumber,
  pitch: Math.round(midiToFreq(n.midiNumber) * 100) / 100,
  velocity: n.velocity,
}));

const lyrics = args.lyrics ? parseLrc(fs.readFileSync(args.lyrics, 'utf8')) : [];
const last = melody[melody.length - 1];
const duration = Math.max(last ? last.time + last.duration : 0, lyrics.length ? lyrics[lyrics.length-1].time + 5 : 0);

const id = args.id || path.basename(args.midi).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pack = {
  id,
  title: args.title || id,
  youtubeId: ytId(args.youtube),
  syncOffset: args.offset ? parseFloat(args.offset) : 0,
  duration: Math.round(duration * 100) / 100,
  sourceTrack: { index: chosen.index, name: chosen.name || '' },
  notes: melody,
  lyrics,
};

const dir = path.join('songs', id);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'song.json'), JSON.stringify(pack, null, 1));
console.log(`\nWrote ${dir}/song.json — ${melody.length} melody notes (was ${tracks.reduce((s,t)=>s+t.notes.length,0)} notes across all tracks), ${lyrics.length} lyric lines, duration ${Math.round(duration)}s`);
