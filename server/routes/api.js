const express  = require('express')
const router   = express.Router()
const { SongDNA, UserProfile, ListenHistory, Moment, SharedSongs, PushSub, RoomSession } = require('../models')
const { enrichSong, flowScore, deriveCategory } = require('../services/music')
const { sendPush, sendPushToRoom } = require('../services/push')
const { requireAuth } = require('./auth')
const { rooms, getRoom, updateStreak, recordListen, computeChemistry } = require('../services/room')

// ─── YOUTUBE SEARCH ──────────────────────────────────────────
router.get('/youtube/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Query required' });
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Search not configured' });
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', q.trim());
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10'); // Music category
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
    res.json({ results });
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
    const history = await ListenHistory.find({ userId: req.user.id })
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
    const profile = await UserProfile.findOne({ userId: req.user.id }).lean();
    res.json({ profile: profile || { userId: req.user.id, streak: 0, longestStreak: 0 } });
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
        'participants.userId': req.user.id,
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

router.get('/radar', requireAuth, async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Radar not configured' });
  try {
    // Build fingerprint from listen history
    const history = await ListenHistory.find({ userId: req.user.id })
      .sort({ listenedAt: -1 }).limit(100).lean();
    if (history.length < 3) return res.json({ results: [], message: 'Listen to more songs to unlock Radar' });

    const dnaList = await Promise.all(history.slice(0,30).map(h => enrichSong(h.videoId, h.title).catch(()=>({}))));
    const valid   = dnaList.filter(d => d.bpm || d.energy != null);
    const avgBpm  = valid.filter(d=>d.bpm).reduce((a,d)=>a+d.bpm,0) / (valid.filter(d=>d.bpm).length||1);
    const avgEnergy = valid.filter(d=>d.energy!=null).reduce((a,d)=>a+d.energy,0) / (valid.filter(d=>d.energy!=null).length||1);
    const moodCounts = {};
    dnaList.forEach(d => { if(d.mood) moodCounts[d.mood]=(moodCounts[d.mood]||0)+1; });
    const dominantMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'neutral';
    const catCounts = {};
    dnaList.forEach(d => { if(d.category) catCounts[d.category]=(catCounts[d.category]||0)+1; });
    const dominantCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Vibes';

    // Build search query from fingerprint
    const MOOD_QUERIES = {
      euphoric: 'upbeat feel good energy',
      confident: 'confident anthem bold',
      chill: 'chill relaxing calm vibes',
      sad: 'emotional heartfelt melancholy',
      aggressive: 'intense powerful hype',
      neutral: 'popular music',
    };
    const BPM_LABEL = avgBpm > 130 ? 'fast energetic' : avgBpm > 100 ? 'upbeat mid-tempo' : avgBpm > 75 ? 'mid-tempo' : 'slow';
    const catQuery  = dominantCat !== 'Vibes' ? dominantCat.toLowerCase() : '';
    const query     = `${MOOD_QUERIES[dominantMood]||'music'} ${BPM_LABEL} ${catQuery} music`.trim();

    // YouTube search
    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    ytUrl.searchParams.set('part', 'snippet');
    ytUrl.searchParams.set('q', query);
    ytUrl.searchParams.set('type', 'video');
    ytUrl.searchParams.set('videoCategoryId', '10');
    ytUrl.searchParams.set('maxResults', '20');
    ytUrl.searchParams.set('key', apiKey);
    const ytRes = await fetch(ytUrl.toString());
    const ytData = await ytRes.json();
    const items  = ytData.items || [];

    // Filter out already heard songs
    const historyIds = new Set(history.map(h => h.videoId));
    const fresh = items.filter(item => !historyIds.has(item.id.videoId));

    // Enrich + score each result
    const fingerprint = { bpm: avgBpm, energy: avgEnergy, mood: dominantMood };
    const scored = await Promise.all(fresh.slice(0, 12).map(async item => {
      const dna = await enrichSong(item.id.videoId, item.snippet.title).catch(() => ({}));
      // Similarity score
      let score = 60;
      if (dna.bpm && fingerprint.bpm) score += Math.max(-25, 25 - Math.abs(dna.bpm - fingerprint.bpm) / 2);
      if (dna.energy != null && fingerprint.energy != null) score += Math.max(-20, 20 - Math.abs(dna.energy - fingerprint.energy) * 40);
      if (dna.mood === fingerprint.mood) score += 15;
      score = Math.max(10, Math.min(99, Math.round(score)));
      return {
        videoId: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url,
        matchScore: score,
        mood: dna.mood || null,
        bpm: dna.bpm || null,
        category: dna.category || null,
      };
    }));

    const results = scored.sort((a,b) => b.matchScore - a.matchScore).filter(r => r.matchScore >= 40);
    res.json({ results, fingerprint: { mood: dominantMood, bpm: Math.round(avgBpm), category: dominantCat }, query });
  } catch (e) {
    console.error('radar error:', e.message);
    res.status(500).json({ error: 'Radar failed' });
  }
});

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
      userId: req.user.id, listenedAt: { $gt: weekAgo }
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
      sessionStart: { $gt: weekAgo }, 'participants.userId': req.user.id
    }).lean();
    const totalMinutes = Math.round(history.length * 3.5); // estimate ~3.5min per song
    const uniqueRooms  = new Set(sessions.map(s=>s.roomId)).size;
    const topRoom      = sessions.reduce((best,s) => {
      const cnt = sessions.filter(x=>x.roomId===s.roomId).length;
      return cnt > (best.count||0) ? { roomId: s.roomId, count: cnt } : best;
    }, {});

    // Profile for streak
    const profile = await UserProfile.findOne({ userId: req.user.id }).lean();

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
    const history = await ListenHistory.find({ userId: req.user.id })
      .sort({ listenedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-_id -__v')
      .lean();
    const total = await ListenHistory.countDocuments({ userId: req.user.id });
    console.log(`[History] GET userId="${req.user.id}" found=${total}`);
    res.json({ history, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: 'Failed to load history' }); }
});

router.delete('/history', requireAuth, async (req, res) => {
  try {
    await ListenHistory.deleteMany({ userId: req.user.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to clear history' }); }
});

// ─── MOMENT STAMP ENDPOINTS ──────────────────────────────────

router.get('/moments', requireAuth, async (req, res) => {
  try {
    const moments = await Moment.find({ userId: req.user.id })
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
      userId: req.user.id,
      videoId,
      timestamp: { $gte: Number(timestamp) - 10, $lte: Number(timestamp) + 10 }
    });
    if (existing) return res.status(409).json({ error: 'Already stamped this moment' });
    await Moment.create({ userId: req.user.id, videoId, title, timestamp, roomId: roomId || '', note: note || '' });
    console.log(`[Moment] ✅ saved for userId="${req.user.id}" title="${(title||'').slice(0,30)}" ts=${timestamp}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to save moment' }); }
});

router.delete('/moments/:videoId', requireAuth, async (req, res) => {
  try {
    const { stampedAt } = req.query;
    const query = { userId: req.user.id, videoId: req.params.videoId };
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
    if (MONGO_URI) {
      await SharedSongs.create({
        shareId,
        sharedBy: req.user.username || req.user.id,
        crateName: crateName || '',
        songs: songs.map(s => ({ videoId: s.videoId, title: s.title })),
      });
    }
    res.json({ shareId, url: `${FRONTEND}/shared/${shareId}` });
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
  if (!VAPID_PUBLIC) return res.status(503).json({ error: 'Push not configured' });
  res.json({ key: VAPID_PUBLIC });
});

// Save a push subscription
router.post('/push/subscribe', requireAuth, async (req, res) => {
  const { subscription, prefs } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  try {
    await PushSub.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        userId: req.user.id,
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
  else await PushSub.deleteMany({ userId: req.user.id });
  res.json({ success: true });
});

// Update notification preferences
router.patch('/push/prefs', requireAuth, async (req, res) => {
  const { prefs } = req.body;
  await PushSub.updateMany({ userId: req.user.id }, { $set: { prefs } });
  res.json({ success: true });
});



module.exports = router
