const express  = require('express')
const router   = express.Router()
const { SongDNA, UserProfile, ListenHistory, Moment, SharedSongs, PushSub, RoomSession, User } = require('../models')

// Normalize Google users to their email_ MongoDB id
async function normalizeUserId(user) {
  if (!user) return null
  if (user.id?.startsWith('email_')) return user.id
  if (user.id?.startsWith('google_') && user.email) {
    try {
      const dbUser = await User.findOne({ email: user.email })
      if (dbUser) return `email_${dbUser._id}`
    } catch {}
  }
  return user.id
}
const { enrichSong, flowScore, deriveCategory } = require('../services/music')
const { sendPush, sendPushToRoom } = require('../services/push')
const { requireAuth } = require('./auth')
const { rooms, getRoom, updateStreak, recordListen, computeChemistry } = require('../services/room')

// ─── PIPED instances for search (no API key needed) ──────────
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://piped-api.garudalinux.org',
];

const INVIDIOUS_INSTANCES = [
  'https://invidious.privacyredirect.com',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
];

// ─── YouTube Innertube API — no key, works server-side ────────
async function fetchAudioStreamYouTube(videoId) {
  // Use YouTube's internal /youtubei/v1/player endpoint
  // This is what youtube.com itself uses — no API key, no CORS on server
  const body = {
    videoId,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0,
      },
    },
  };
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.09.37',
        'Origin': 'https://www.youtube.com',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const formats = data?.streamingData?.adaptiveFormats || [];
    // Pick best audio-only: opus/webm preferred, then mp4a
    const audioFormats = formats.filter(f => f.mimeType?.includes('audio'));
    const opus = audioFormats.find(f => f.mimeType?.includes('opus'));
    const mp4a = audioFormats.find(f => f.mimeType?.includes('mp4a'));
    const best = opus || mp4a || audioFormats[0];
    if (best?.url) return { url: best.url, source: 'youtube' };
    return null;
  } catch { return null; }
}

// ─── Resolve audio stream URL server-side (no browser CORS) ──
async function fetchAudioStreamServer(videoId) {
  // 1. Try YouTube Innertube (most reliable, no external dependency)
  const ytResult = await fetchAudioStreamYouTube(videoId);
  if (ytResult) return ytResult;

  // 2. Try Piped instances as fallback
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const streams = data.audioStreams || [];
      const opus = streams.find(s => s.mimeType?.includes('opus') && s.bitrate >= 128000);
      const mp4a = streams.find(s => s.mimeType?.includes('mp4a'));
      const best = opus || mp4a || streams[0];
      if (best?.url) return { url: best.url, source: 'piped' };
    } catch { continue; }
  }
  // 3. Try Invidious instances
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats`, {
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const formats = (data.adaptiveFormats || []).filter(f => f.type?.includes('audio'));
      formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (formats[0]?.url) return { url: formats[0].url, source: 'invidious' };
    } catch { continue; }
  }
  return null;
}

async function searchViaPiped(query, limit = 10) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      const items = (data.items || []).filter(i => i.type === 'stream').slice(0, limit);
      if (items.length === 0) continue;
      return items.map(item => ({
        videoId: item.url?.replace('/watch?v=', '') || item.videoId,
        title: item.title,
        channel: item.uploaderName || item.channel || '',
        thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.url?.replace('/watch?v=', '')}/mqdefault.jpg`,
        duration: item.duration,
      }));
    } catch { continue; }
  }
  return null;
}

// ─── YOUTUBE SEARCH — Piped first, YouTube Data API fallback ─
router.get('/youtube/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Query required' });

  // Try Piped first (free, no key)
  try {
    const pipedResults = await searchViaPiped(q.trim());
    if (pipedResults && pipedResults.length > 0) {
      return res.json({ results: pipedResults, source: 'piped' });
    }
  } catch {}

  // Fallback: YouTube Data API
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Search unavailable — no API key configured' });
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', q.trim());
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10');
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('key', apiKey);
    const response = await fetch(url.toString());
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const results = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    }));
    res.json({ results, source: 'youtube' });
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── SONG DNA ENDPOINTS ──────────────────────────────────────

// Enrich a single song (or batch)
router.post('/song-dna', requireAuth, async (req, res) => {
  const { songs } = req.body; // [{ videoId, title }]
  if (!Array.isArray(songs)) return res.status(400).json({ error: 'songs array required' });
  const capped = songs.slice(0, 20); // max 20 at a time
  try {
    const results = await Promise.all(
      capped.map(s => enrichSong(s.videoId, s.title))
    );
    res.json({ dna: results });
  } catch (e) {
    res.status(500).json({ error: 'Enrichment failed' });
  }
});

// Categorize songs in bulk — used by Library and Queue
router.post('/categorize', requireAuth, async (req, res) => {
  const { songs } = req.body;
  if (!Array.isArray(songs)) return res.status(400).json({ error: 'songs array required' });
  const capped = songs.slice(0, 50);
  try {
    const results = await Promise.all(
      capped.map(async s => {
        const dna = await enrichSong(s.videoId, s.title);
        return {
          videoId: s.videoId,
          category: dna.category || 'Vibes',
          mood: dna.mood || 'neutral',
          bpm: dna.bpm || null,
          energy: dna.energy || null,
        };
      })
    );
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Categorization failed' });
  }
});

// Flow scores for a queue
router.post('/flow-scores', requireAuth, async (req, res) => {
  const { songs } = req.body; // [{ videoId, title }]
  if (!Array.isArray(songs) || songs.length < 2)
    return res.json({ scores: [] });
  try {
    const dnaList = await Promise.all(songs.map(s => enrichSong(s.videoId, s.title)));
    const scores = dnaList.slice(1).map((song, i) => ({
      videoId: song.videoId,
      score: flowScore(dnaList[i], song),
      fromMood: dnaList[i].mood,
      toMood: song.mood,
      bpmDiff: (dnaList[i].bpm && song.bpm) ? Math.abs(dnaList[i].bpm - song.bpm) : null,
    }));
    res.json({ scores });
  } catch (e) {
    res.status(500).json({ error: 'Flow score failed' });
  }
});

// Personal taste fingerprint
router.get('/taste-fingerprint', requireAuth, async (req, res) => {
  try {
    // Get user's listen history
    const history = await ListenHistory.find({ userId: await normalizeUserId(req.user) })
      .sort({ listenedAt: -1 })
      .limit(100)
      .lean();

    if (history.length < 3) {
      return res.json({ fingerprint: null, message: 'Listen to more songs to build your fingerprint' });
    }

    // Fetch DNA for all songs (use cache heavily)
    const dnaList = await Promise.all(
      history.map(h => enrichSong(h.videoId, h.title))
    );

    // Aggregate
    const valid = dnaList.filter(d => d.bpm || d.energy != null);
    const avgBpm = valid.filter(d=>d.bpm).reduce((a,d)=>a+d.bpm,0) / (valid.filter(d=>d.bpm).length||1);
    const avgEnergy = valid.filter(d=>d.energy!=null).reduce((a,d)=>a+d.energy,0) / (valid.filter(d=>d.energy!=null).length||1);
    const avgDance = valid.filter(d=>d.danceability!=null).reduce((a,d)=>a+d.danceability,0) / (valid.filter(d=>d.danceability!=null).length||1);

    // Mood distribution
    const moodCounts = {};
    dnaList.forEach(d => { moodCounts[d.mood||'neutral'] = (moodCounts[d.mood||'neutral']||0)+1; });
    const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'neutral';

    // Variety score — how diverse are the BPMs?
    const bpms = valid.filter(d=>d.bpm).map(d=>d.bpm);
    const bpmStdDev = bpms.length > 1
      ? Math.sqrt(bpms.reduce((s,b)=>s+(b-avgBpm)**2,0)/bpms.length)
      : 0;
    const variety = Math.min(100, Math.round(bpmStdDev / 0.5));

    res.json({
      fingerprint: {
        energy:       Math.round(avgEnergy * 100),
        danceability: Math.round(avgDance * 100),
        bpm:          Math.round(avgBpm),
        variety,
        dominantMood,
        moodBreakdown: moodCounts,
        totalSongs:   history.length,
      }
    });
  } catch (e) {
    console.error('taste-fingerprint error:', e.message);
    res.status(500).json({ error: 'Failed to build fingerprint' });
  }
});

// ─── STREAK + PROFILE ENDPOINTS ─────────────────────────────

router.get('/profile/me', requireAuth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: await normalizeUserId(req.user) }).lean();
    res.json({ profile: profile || { userId: await normalizeUserId(req.user), streak: 0, longestStreak: 0 } });
  } catch (e) { res.status(500).json({ error: 'Failed to load profile' }); }
});

router.get('/profile/leaderboard/:roomId', requireAuth, async (req, res) => {
  try {
    // Top streaks among users who have been in this room
    const sessions = await RoomSession.find({ 'participants.roomId': req.params.roomId }).lean();
    const userIds  = [...new Set(sessions.flatMap(s => s.participants.map(p => p.userId)))];
    const profiles = await UserProfile.find({ userId: { $in: userIds } })
      .sort({ streak: -1 }).limit(10).lean();
    res.json({ leaderboard: profiles });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ─── CHEMISTRY ENDPOINTS ─────────────────────────────────────

router.get('/chemistry/:roomId', requireAuth, async (req, res) => {
  try {
    const sessions = await RoomSession.find({ roomId: req.params.roomId })
      .sort({ sessionStart: -1 }).limit(10).lean();
    const avg = sessions.length
      ? Math.round(sessions.reduce((a,s)=>a+s.chemistry,0)/sessions.length)
      : null;
    res.json({ sessions, avgChemistry: avg });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ─── GROOVE TIME MACHINE ENDPOINTS ───────────────────────────

router.get('/time-machine', requireAuth, async (req, res) => {
  try {
    const today = new Date();
    const memories = [];
    // Check 30, 60, 90, 365 days ago
    for (const daysAgo of [7, 14, 30, 60, 90, 365]) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - daysAgo);
      const dayStart = new Date(targetDate.setHours(0,0,0,0)).getTime();
      const dayEnd   = dayStart + 86400000;
      const sessions = await RoomSession.find({
        sessionStart: { $gte: dayStart, $lt: dayEnd },
        'participants.userId': await normalizeUserId(req.user),
      }).lean();
      if (sessions.length > 0) {
        memories.push({
          daysAgo,
          date: new Date(dayStart).toISOString(),
          sessions: sessions.map(s => ({
            roomId: s.roomId,
            songsPlayed: s.songsPlayed,
            participants: s.participants,
            chemistry: s.chemistry,
            dominantMood: s.dominantMood,
            sessionStart: s.sessionStart,
          }))
        });
      }
    }
    res.json({ memories });
  } catch (e) { res.status(500).json({ error: 'Failed to load memories' }); }
});

// ─── GROOVE RADAR ENDPOINT ────────────────────────────────────

// ── Smart Radar Helpers ───────────────────────────────────────

// Time-aware context: what kind of music fits right now?
function getTimeContext() {
  const hour = new Date().getHours()
  const day  = new Date().getDay() // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6
  if (hour >= 23 || hour < 5)  return { label: 'Late Night',  mood: 'chill',     bpmBoost: -10, energy: 'low' }
  if (hour >= 5  && hour < 9)  return { label: 'Morning',     mood: 'chill',     bpmBoost:   0, energy: 'low' }
  if (hour >= 9  && hour < 12) return { label: 'Focus Time',  mood: 'confident', bpmBoost:   5, energy: 'mid' }
  if (hour >= 12 && hour < 17) return { label: 'Afternoon',   mood: 'neutral',   bpmBoost:   0, energy: 'mid' }
  if (isWeekend && hour >= 20) return { label: 'Weekend Night',mood: 'euphoric', bpmBoost:  15, energy: 'high'}
  if (hour >= 17 && hour < 20) return { label: 'Evening',     mood: 'chill',     bpmBoost:  -5, energy: 'mid' }
  return                               { label: 'Evening',     mood: 'neutral',   bpmBoost:   0, energy: 'mid' }
}

// Extract artist name from song title
function extractArtist(title = '') {
  const parts = title.split(/[-–|]/)
  if (parts.length >= 2) return parts[0].trim()
  return ''
}

// Fetch similar tracks from Last.fm
async function getLastFmSimilar(artist, track, limit = 10) {
  const key = process.env.LASTFM_API_KEY
  if (!key || !artist) return []
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&api_key=${key}&format=json&limit=${limit}`
    const res  = await fetch(url)
    const data = await res.json()
    return (data.similartracks?.track || []).map(t => ({
      title: `${t.artist?.name || artist} - ${t.name}`,
      artist: t.artist?.name || artist,
      track: t.name,
      match: parseFloat(t.match) || 0.5,
    }))
  } catch { return [] }
}

// Fetch similar artists from Last.fm
async function getLastFmSimilarArtists(artist, limit = 5) {
  const key = process.env.LASTFM_API_KEY
  if (!key || !artist) return []
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist)}&api_key=${key}&format=json&limit=${limit}`
    const res  = await fetch(url)
    const data = await res.json()
    return (data.similarartists?.artist || []).map(a => a.name)
  } catch { return [] }
}

// Fetch top tracks for an artist from Last.fm
async function getLastFmTopTracks(artist, limit = 3) {
  const key = process.env.LASTFM_API_KEY
  if (!key || !artist) return []
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${key}&format=json&limit=${limit}`
    const res  = await fetch(url)
    const data = await res.json()
    return (data.toptracks?.track || []).map(t => ({
      title: `${artist} - ${t.name}`,
      artist,
      track: t.name,
    }))
  } catch { return [] }
}

// Search YouTube for exact song
async function ytSearch(query, apiKey, maxResults = 3) {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'video')
    url.searchParams.set('videoCategoryId', '10')
    url.searchParams.set('maxResults', maxResults)
    url.searchParams.set('key', apiKey)
    const res  = await fetch(url.toString())
    const data = await res.json()
    return (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title:   item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url,
    }))
  } catch { return [] }
}

// Build co-occurrence map from room history (collaborative filtering)
async function getRoomCoOccurrences(videoIds, historyIds) {
  if (!process.env.MONGODB_URI || !videoIds.length) return {}
  try {
    // Find all listen history entries in same rooms where user's songs were played
    const userRoomIds = await ListenHistory.distinct('roomId', { videoId: { $in: videoIds } })
    if (!userRoomIds.length) return {}
    // Get what other people listened to in those rooms
    const coListens = await ListenHistory.find({
      roomId: { $in: userRoomIds },
      videoId: { $nin: [...historyIds] }
    }).lean()
    // Count co-occurrence frequency
    const freq = {}
    coListens.forEach(h => {
      if (!freq[h.videoId]) freq[h.videoId] = { count: 0, title: h.title }
      freq[h.videoId].count++
    })
    return freq
  } catch { return {} }
}

router.get('/radar', requireAuth, async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Radar not configured' })

  try {
    // 1. Get listen history
    const history = await ListenHistory.find({ userId: await normalizeUserId(req.user) })
      .sort({ listenedAt: -1 }).limit(150).lean()
    if (history.length < 3) return res.json({ results: [], message: 'Listen to more songs to unlock Radar' })

    const historyIds = new Set(history.map(h => h.videoId))

    // 2. Build taste fingerprint from DNA
    const dnaList = await Promise.all(
      history.slice(0, 40).map(h => enrichSong(h.videoId, h.title).catch(() => ({})))
    )
    const valid   = dnaList.filter(d => d.bpm)
    const avgBpm  = valid.length ? valid.reduce((a, d) => a + d.bpm, 0) / valid.length : 120
    const validE  = dnaList.filter(d => d.energy != null)
    const avgEnergy = validE.length ? validE.reduce((a, d) => a + d.energy, 0) / validE.length : 0.5
    const moodCounts = {}
    dnaList.forEach(d => { if (d.mood) moodCounts[d.mood] = (moodCounts[d.mood] || 0) + 1 })
    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral'
    const catCounts = {}
    dnaList.forEach(d => { if (d.category) catCounts[d.category] = (catCounts[d.category] || 0) + 1 })
    const dominantCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Vibes'

    // 3. Time-aware context
    const timeCtx = getTimeContext()
    const targetBpm = Math.max(60, Math.min(180, avgBpm + timeCtx.bpmBoost))

    // 4. Extract top artists from history
    const artistFreq = {}
    history.forEach(h => {
      const artist = extractArtist(h.title)
      if (artist) artistFreq[artist] = (artistFreq[artist] || 0) + 1
    })
    const topArtists = Object.entries(artistFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([a]) => a)

    // 5. Get Last.fm similar tracks + similar artists' top tracks
    const lfmCandidates = []

    // Similar tracks for top 3 most listened songs
    const topSongs = history.slice(0, 3)
    await Promise.all(topSongs.map(async h => {
      const artist = extractArtist(h.title)
      if (!artist) return
      const similar = await getLastFmSimilar(artist, h.title.replace(artist, '').replace(/^[-–|\s]+/, '').trim(), 8)
      lfmCandidates.push(...similar)
    }))

    // Similar artists → their top tracks
    const similarArtists = []
    await Promise.all(topArtists.slice(0, 3).map(async artist => {
      const similar = await getLastFmSimilarArtists(artist, 4)
      similarArtists.push(...similar)
    }))
    const uniqueSimilarArtists = [...new Set(similarArtists)].slice(0, 8)
    await Promise.all(uniqueSimilarArtists.map(async artist => {
      const tracks = await getLastFmTopTracks(artist, 3)
      lfmCandidates.push(...tracks)
    }))

    // 6. YouTube related videos for top 3 listened songs
    const relatedCandidates = []
    await Promise.all(history.slice(0, 3).map(async h => {
      try {
        const url = new URL('https://www.googleapis.com/youtube/v3/search')
        url.searchParams.set('part', 'snippet')
        url.searchParams.set('type', 'video')
        url.searchParams.set('relatedToVideoId', h.videoId)
        url.searchParams.set('videoCategoryId', '10')
        url.searchParams.set('maxResults', '8')
        url.searchParams.set('key', apiKey)
        const r = await fetch(url.toString())
        const d = await r.json()
        ;(d.items || []).forEach(item => {
          if (!historyIds.has(item.id?.videoId) && item.id?.videoId) {
            relatedCandidates.push({
              videoId: item.id.videoId,
              title: item.snippet.title,
              channel: item.snippet.channelTitle,
              thumbnail: item.snippet.thumbnails?.medium?.url,
              source: 'related',
              baseScore: 70,
            })
          }
        })
      } catch {}
    }))

    // 7. Collaborative filtering — what do users with same taste listen to?
    const coFreq = await getRoomCoOccurrences(history.slice(0, 20).map(h => h.videoId), historyIds)
    const coSongs = Object.entries(coFreq)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([videoId, { title, count }]) => ({ videoId, title, coScore: count }))

    // 8. Search YouTube for Last.fm candidates (deduplicated)
    const seen = new Set([...historyIds])
    const ytCandidates = []

    // Last.fm candidates → YouTube search
    const uniqueLfm = lfmCandidates.filter((c, i, arr) =>
      arr.findIndex(x => x.title === c.title) === i
    ).slice(0, 15)

    await Promise.all(uniqueLfm.map(async c => {
      const results = await ytSearch(`${c.artist} ${c.track} official`, apiKey, 1)
      results.forEach(r => {
        if (!seen.has(r.videoId)) {
          seen.add(r.videoId)
          ytCandidates.push({ ...r, source: 'lastfm', lfmMatch: c.match || 0.5, baseScore: 75 })
        }
      })
    }))

    // Related videos candidates
    relatedCandidates.forEach(r => {
      if (!seen.has(r.videoId)) {
        seen.add(r.videoId)
        ytCandidates.push(r)
      }
    })

    // Co-occurrence candidates → YouTube search
    await Promise.all(coSongs.map(async c => {
      if (seen.has(c.videoId)) {
        // Already have it, just add with coScore
        const existing = ytCandidates.find(x => x.videoId === c.videoId)
        if (existing) existing.coScore = c.coScore
        return
      }
      seen.add(c.videoId)
      ytCandidates.push({
        videoId: c.videoId,
        title: c.title,
        source: 'collaborative',
        coScore: c.coScore,
        baseScore: 65,
        thumbnail: `https://img.youtube.com/vi/${c.videoId}/mqdefault.jpg`,
        channel: '',
      })
    }))

    // 9. Enrich + score all candidates
    const fingerprint = { bpm: targetBpm, energy: avgEnergy, mood: dominantMood }

    const scored = await Promise.all(ytCandidates.slice(0, 20).map(async item => {
      const dna = await enrichSong(item.videoId, item.title).catch(() => ({}))

      // Base score from source quality
      let score = item.baseScore || 60

      // Last.fm similarity match (0-1 float → 0-20 points)
      if (item.lfmMatch) score += item.lfmMatch * 20

      // Collaborative filtering bonus (capped at 15)
      if (item.coScore) score += Math.min(15, item.coScore * 3)

      // BPM match (±20 points)
      if (dna.bpm && fingerprint.bpm) {
        const bpmDiff = Math.abs(dna.bpm - fingerprint.bpm)
        score += bpmDiff < 10 ? 20 : bpmDiff < 20 ? 12 : bpmDiff < 35 ? 5 : -5
      }

      // Energy match (±15 points)
      if (dna.energy != null && fingerprint.energy != null) {
        const eDiff = Math.abs(dna.energy - fingerprint.energy)
        score += eDiff < 0.1 ? 15 : eDiff < 0.2 ? 8 : eDiff < 0.35 ? 3 : -5
      }

      // Mood match (+12 points)
      if (dna.mood === fingerprint.mood) score += 12

      // Time context mood bonus (+8)
      if (dna.mood === timeCtx.mood) score += 8

      score = Math.max(10, Math.min(99, Math.round(score)))

      return {
        videoId: item.videoId,
        title: item.title,
        channel: item.channel || '',
        thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`,
        matchScore: score,
        mood: dna.mood || null,
        bpm: dna.bpm ? Math.round(dna.bpm) : null,
        category: dna.category || null,
        source: item.source || 'search',
      }
    }))

    // 10. Sort, deduplicate, return top results
    const results = scored
      .filter(r => r.matchScore >= 40)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 15)

    res.json({
      results,
      fingerprint: {
        mood: dominantMood,
        bpm: Math.round(avgBpm),
        category: dominantCat,
        timeContext: timeCtx.label,
        targetBpm: Math.round(targetBpm),
      },
    })

  } catch (e) {
    console.error('radar error:', e.message)
    res.status(500).json({ error: 'Radar failed' })
  }
})

// ─── SMART RADIO ENDPOINT ─────────────────────────────────────

router.post('/radio/next', requireAuth, async (req, res) => {
  const { lastSong, roomHistory = [] } = req.body;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !lastSong) return res.status(400).json({ error: 'Missing data' });
  try {
    const dna = await enrichSong(lastSong.videoId, lastSong.title).catch(() => ({}));
    const MOOD_QUERIES = {
      euphoric:'upbeat feel good', confident:'confident bold anthem',
      chill:'chill relaxing calm', sad:'emotional heartfelt',
      aggressive:'intense hype powerful', neutral:'popular music',
    };
    const bpmLabel = (dna.bpm||120) > 130 ? 'fast' : (dna.bpm||120) > 100 ? 'upbeat' : 'chill';
    const query = `${MOOD_QUERIES[dna.mood||'neutral']} ${bpmLabel} ${dna.category||''} music`.trim();

    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    ytUrl.searchParams.set('part','snippet');
    ytUrl.searchParams.set('q', query);
    ytUrl.searchParams.set('type','video');
    ytUrl.searchParams.set('videoCategoryId','10');
    ytUrl.searchParams.set('maxResults','10');
    ytUrl.searchParams.set('key', apiKey);
    const ytRes  = await fetch(ytUrl.toString());
    const ytData = await ytRes.json();
    const historyIds = new Set([...roomHistory, lastSong.videoId]);
    const fresh = (ytData.items||[]).filter(item => !historyIds.has(item.id.videoId));

    const songs = fresh.slice(0,5).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      addedBy: '📻 Radio',
      thumbnail: item.snippet.thumbnails?.medium?.url,
    }));
    res.json({ songs, mood: dna.mood, query });
  } catch (e) {
    res.status(500).json({ error: 'Radio failed' });
  }
});

// ─── WEEKLY WRAPPED ENDPOINT ──────────────────────────────────

router.get('/wrapped', requireAuth, async (req, res) => {
  try {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const history = await ListenHistory.find({
      userId: await normalizeUserId(req.user), listenedAt: { $gt: weekAgo }
    }).sort({ listenedAt: -1 }).lean();

    if (history.length < 3) return res.json({ wrapped: null, message: 'Not enough data for this week yet' });

    // Top songs by frequency
    const songCounts = {};
    history.forEach(h => { songCounts[h.videoId] = { ...(songCounts[h.videoId]||{title:h.title,videoId:h.videoId,count:0}), count: (songCounts[h.videoId]?.count||0)+1 }; });
    const topSongs = Object.values(songCounts).sort((a,b)=>b.count-a.count).slice(0,5);

    // DNA analysis
    const dnaList = await Promise.all(history.slice(0,30).map(h => enrichSong(h.videoId, h.title).catch(()=>({}))));
    const moodCounts = {};
    dnaList.forEach(d => { if(d.mood) moodCounts[d.mood]=(moodCounts[d.mood]||0)+1; });
    const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'neutral';
    const bpms = dnaList.filter(d=>d.bpm).map(d=>d.bpm);
    const avgBpm = bpms.length ? Math.round(bpms.reduce((a,b)=>a+b,0)/bpms.length) : null;

    // Sessions this week
    const sessions = await RoomSession.find({
      sessionStart: { $gt: weekAgo }, 'participants.userId': await normalizeUserId(req.user)
    }).lean();
    const totalMinutes = Math.round(history.length * 3.5); // estimate ~3.5min per song
    const uniqueRooms  = new Set(sessions.map(s=>s.roomId)).size;
    const topRoom      = sessions.reduce((best,s) => {
      const cnt = sessions.filter(x=>x.roomId===s.roomId).length;
      return cnt > (best.count||0) ? { roomId: s.roomId, count: cnt } : best;
    }, {});

    // Profile for streak
    const profile = await UserProfile.findOne({ userId: await normalizeUserId(req.user) }).lean();

    res.json({
      wrapped: {
        weekStart: new Date(weekAgo).toISOString(),
        topSongs,
        dominantMood,
        avgBpm,
        totalSongs: history.length,
        totalMinutes,
        uniqueRooms,
        topRoom: topRoom.roomId || null,
        streak: profile?.streak || 0,
        moodBreakdown: moodCounts,
        sessions: sessions.length,
      }
    });
  } catch (e) {
    console.error('wrapped error:', e.message);
    res.status(500).json({ error: 'Failed to build wrapped' });
  }
});

// ─── LISTEN HISTORY ENDPOINTS ────────────────────────────────

router.get('/history', requireAuth, async (req, res) => {
  try {
    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '50');
    const history = await ListenHistory.find({ userId: await normalizeUserId(req.user) })
      .sort({ listenedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-_id -__v')
      .lean();
    const total = await ListenHistory.countDocuments({ userId: await normalizeUserId(req.user) });
    console.log(`[History] GET userId="${req.user.id}" found=${total}`);
    res.json({ history, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: 'Failed to load history' }); }
});

router.delete('/history', requireAuth, async (req, res) => {
  try {
    await ListenHistory.deleteMany({ userId: await normalizeUserId(req.user) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to clear history' }); }
});

// ─── MOMENT STAMP ENDPOINTS ──────────────────────────────────

router.get('/moments', requireAuth, async (req, res) => {
  try {
    const moments = await Moment.find({ userId: await normalizeUserId(req.user) })
      .sort({ stampedAt: -1 })
      .limit(200)
      .select('-_id -__v')
      .lean();
    res.json({ moments });
  } catch (e) { res.status(500).json({ error: 'Failed to load moments' }); }
});

router.post('/moments', requireAuth, async (req, res) => {
  const { videoId, title, timestamp, roomId, note } = req.body;
  if (!videoId || timestamp === undefined)
    return res.status(400).json({ error: 'videoId and timestamp required' });
  try {
    // Check duplicate — same song + within 10s of existing stamp
    const existing = await Moment.findOne({
      userId: await normalizeUserId(req.user),
      videoId,
      timestamp: { $gte: Number(timestamp) - 10, $lte: Number(timestamp) + 10 }
    });
    if (existing) return res.status(409).json({ error: 'Already stamped this moment' });
    await Moment.create({ userId: await normalizeUserId(req.user), videoId, title, timestamp, roomId: roomId || '', note: note || '' });
    console.log(`[Moment] ✅ saved for userId="${req.user.id}" title="${(title||'').slice(0,30)}" ts=${timestamp}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to save moment' }); }
});

router.delete('/moments/:videoId', requireAuth, async (req, res) => {
  try {
    const { stampedAt } = req.query;
    const query = { userId: await normalizeUserId(req.user), videoId: req.params.videoId };
    if (stampedAt) query.stampedAt = Number(stampedAt);
    await Moment.deleteMany(query);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete moment' }); }
});

// ─── SHARED SONGS ENDPOINTS ──────────────────────────────────

// Create a share link for selected songs
router.post('/share/songs', requireAuth, async (req, res) => {
  const { songs, crateName } = req.body;
  if (!Array.isArray(songs) || songs.length === 0)
    return res.status(400).json({ error: 'No songs provided' });
  if (songs.length > 100)
    return res.status(400).json({ error: 'Max 100 songs per share' });

  // Generate short 8-char ID
  const shareId = randomUUID().replace(/-/g, '').slice(0, 8);

  try {
    if (process.env.MONGODB_URI) {
      await SharedSongs.create({
        shareId,
        sharedBy: req.user.username || req.user.id,
        crateName: crateName || '',
        songs: songs.map(s => ({ videoId: s.videoId, title: s.title })),
      });
    }
    res.json({ shareId, url: `${process.env.FRONTEND_URL}/shared/${shareId}` });
  } catch (e) {
    console.error('POST /share/songs error:', e);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Get shared songs by shareId — public, no auth required
router.get('/share/songs/:shareId', async (req, res) => {
  try {
    const share = await SharedSongs.findOne({ shareId: req.params.shareId }).lean();
    if (!share) return res.status(404).json({ error: 'Share link not found or expired' });
    res.json({
      shareId: share.shareId,
      sharedBy: share.sharedBy,
      crateName: share.crateName,
      songs: share.songs,
      createdAt: share.createdAt,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load shared songs' });
  }
});

// ─── PUSH NOTIFICATION ENDPOINTS ─────────────────────────────

// Return VAPID public key so client can subscribe
router.get('/push/vapid-public-key', requireAuth, (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured' });
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// Save a push subscription
router.post('/push/subscribe', requireAuth, async (req, res) => {
  const { subscription, prefs } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  try {
    await PushSub.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        userId: await normalizeUserId(req.user),
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        prefs: prefs || {},
        createdAt: Date.now()
      },
      { upsert: true, new: true }
    );
    console.log(`[Push] ✅ subscription saved for userId="${req.user.id}"`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Remove a push subscription (user turned off notifications)
router.post('/push/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) await PushSub.deleteOne({ endpoint });
  else await PushSub.deleteMany({ userId: await normalizeUserId(req.user) });
  res.json({ success: true });
});

// Update notification preferences
router.patch('/push/prefs', requireAuth, async (req, res) => {
  const { prefs } = req.body;
  await PushSub.updateMany({ userId: await normalizeUserId(req.user) }, { $set: { prefs } });
  res.json({ success: true });
});



module.exports = router