import type { LrcLine } from '../types';

// Parse LRC format lyrics into timed lines
export function parseLRC(lrcText: string): LrcLine[] {
  const lines = lrcText.split('\n');
  const result: LrcLine[] = [];

  for (const line of lines) {
    // Match [mm:ss.xx] or [mm:ss:xx] format
    const match = line.match(/\[(\d+):(\d+)(?:[.:](\d+))?\]\s*(.*)/);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const centiseconds = match[3] ? parseInt(match[3].padEnd(2, '0').slice(0, 2), 10) : 0;
    const text = match[4].trim();

    const time = minutes * 60 + seconds + centiseconds / 100;

    if (text) {
      result.push({ time, text });
    }
  }

  // Sort by time
  result.sort((a, b) => a.time - b.time);

  return result;
}

// Get the current lyric line at a given time
export function getLyricAtTime(lyrics: LrcLine[], time: number): LrcLine | null {
  if (lyrics.length === 0) return null;

  // Find the last lyric that started before or at current time
  let currentLyric: LrcLine | null = null;
  
  for (const lyric of lyrics) {
    if (lyric.time <= time) {
      currentLyric = lyric;
    } else {
      break;
    }
  }

  return currentLyric;
}

// Get upcoming lyrics within a time window
export function getUpcomingLyrics(lyrics: LrcLine[], currentTime: number, windowSeconds: number): LrcLine[] {
  return lyrics.filter(lyric => 
    lyric.time >= currentTime && lyric.time <= currentTime + windowSeconds
  );
}

// Fetch lyrics from lrclib.net API
export async function fetchLyricsFromLrcLib(title: string, artist?: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ track_name: title });
    if (artist) {
      params.append('artist_name', artist);
    }

    const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
    
    if (!response.ok) {
      console.error('LRCLib API error:', response.status);
      return null;
    }

    const results = await response.json();
    
    if (results.length === 0) {
      return null;
    }

    // Return the synced lyrics from the first result
    const firstResult = results[0];
    return firstResult.syncedLyrics || firstResult.plainLyrics || null;
  } catch (error) {
    console.error('Failed to fetch lyrics:', error);
    return null;
  }
}

// Extract video title from YouTube (for searching lyrics)
export function extractYouTubeTitle(videoTitle: string): { title: string; artist: string | null } {
  // Common patterns: "Artist - Title", "Title by Artist", "Title (Official Video)"
  
  // Remove common suffixes
  let cleaned = videoTitle
    .replace(/\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\(official\s*audio\)/gi, '')
    .replace(/\(lyric\s*video\)/gi, '')
    .replace(/\(lyrics\)/gi, '')
    .replace(/\[official\s*(music\s*)?video\]/gi, '')
    .replace(/\[lyrics\]/gi, '')
    .replace(/\|.*$/, '')
    .trim();

  // Try "Artist - Title" pattern
  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim(),
      title: dashMatch[2].trim()
    };
  }

  // Try "Title by Artist" pattern
  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim()
    };
  }

  // Just return the cleaned title
  return {
    title: cleaned,
    artist: null
  };
}
