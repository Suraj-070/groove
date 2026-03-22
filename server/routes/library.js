const express   = require('express')
const router    = express.Router()
const { randomUUID } = require('crypto')
const { Library, SharedSongs, ListenHistory, User } = require('../models')
const { requireAuth } = require('./auth')

// Normalize userId — email users use email_<mongoId>, Google users use google_<googleId>
// For Google users who also have a MongoDB account, use the email_ id for consistency
async function normalizeUserId(user) {
  if (!user) return null
  // Already email_ format — consistent
  if (user.id?.startsWith('email_')) return user.id
  // Google user — check if they have a MongoDB account
  if (user.id?.startsWith('google_') && user.email) {
    try {
      const dbUser = await User.findOne({ email: user.email })
      if (dbUser) return `email_${dbUser._id}`
    } catch {}
  }
  // Fall back to whatever id they have
  return user.id
}

// In-memory fallback when no MongoDB
const memLibraries = {}
async function getLibrary(userId) {
  if (!process.env.MONGODB_URI) {
    if (!memLibraries[userId]) memLibraries[userId] = { categories: [] }
    return memLibraries[userId]
  }
  let lib = await Library.findOne({ userId })
  if (!lib) lib = await Library.create({ userId, categories: [] })
  return lib
}

// ─── LIBRARY API ──────────────────────────────────────────────
router.get('/library', requireAuth, async (req, res) => {
  try {
    const userId = await normalizeUserId(req.user); const lib = await getLibrary(userId);
    res.json({ categories: lib.categories });
  } catch (e) {
    console.error('GET /library error:', e);
    res.status(500).json({ error: 'Failed to load library' });
  }
});

router.post('/library/categories', requireAuth, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const category = { id: randomUUID(), name: name.trim(), color: color || '#7c6aff', songs: [], createdAt: Date.now() };

    if (!process.env.MONGODB_URI) {
      const userId = await normalizeUserId(req.user); const lib = await getLibrary(userId);
      lib.categories.push(category);
      return res.json(category);
    }

    await Library.findOneAndUpdate(
      { userId: await normalizeUserId(req.user) },
      { $push: { categories: category }, $set: { updatedAt: Date.now() } },
      { upsert: true }
    );
    res.json(category);
  } catch (e) {
    console.error('POST /library/categories error:', e);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

router.delete('/library/categories/:categoryId', requireAuth, async (req, res) => {
  try {
    if (!process.env.MONGODB_URI) {
      const userId = await normalizeUserId(req.user); const lib = await getLibrary(userId);
      lib.categories = lib.categories.filter(c => c.id !== req.params.categoryId);
      return res.json({ success: true });
    }
    await Library.findOneAndUpdate(
      { userId: await normalizeUserId(req.user) },
      { $pull: { categories: { id: req.params.categoryId } }, $set: { updatedAt: Date.now() } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

router.post('/library/categories/:categoryId/songs', requireAuth, async (req, res) => {
  try {
    const { videoId, title } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    const userId = await normalizeUserId(req.user); const lib = await getLibrary(userId);
    const categories = lib.categories || [];
    const category = categories.find(c => c.id === req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Collection not found' });
    if ((category.songs || []).find(s => s.videoId === videoId))
      return res.status(409).json({ error: 'Song already in collection' });

    const song = { videoId, title, addedAt: Date.now() };

    if (!process.env.MONGODB_URI) {
      category.songs.push(song);
      return res.json(song);
    }

    await Library.findOneAndUpdate(
      { userId: await normalizeUserId(req.user), 'categories.id': req.params.categoryId },
      { $push: { 'categories.$.songs': song }, $set: { updatedAt: Date.now() } }
    );
    res.json(song);
  } catch (e) {
    console.error('POST /library/songs error:', e);
    res.status(500).json({ error: 'Failed to add song' });
  }
});

// ── Batch add songs to a crate (playlist import) ─────────────
// Single HTTP request instead of N sequential requests
router.post('/library/categories/:categoryId/songs/batch', requireAuth, async (req, res) => {
  try {
    const { songs } = req.body; // [{ videoId, title }, ...]
    if (!Array.isArray(songs) || songs.length === 0)
      return res.status(400).json({ error: 'songs array required' });

    const CRATE_SONG_LIMIT = 500;
    const userId = await normalizeUserId(req.user); const lib = await getLibrary(userId);
    const category = (lib.categories || []).find(c => c.id === req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Collection not found' });

    const existing = new Set((category.songs || []).map(s => s.videoId));
    const remaining = CRATE_SONG_LIMIT - (category.songs || []).length;

    if (remaining <= 0)
      return res.status(409).json({ error: 'CRATE_FULL', limit: CRATE_SONG_LIMIT });

    // Deduplicate + cap
    const toAdd = songs
      .filter(s => s.videoId && s.title && !existing.has(s.videoId))
      .slice(0, remaining)
      .map(s => ({ videoId: s.videoId, title: s.title, addedAt: Date.now() }));

    const skipped = songs.length - toAdd.length;

    if (!process.env.MONGODB_URI) {
      category.songs.push(...toAdd);
      return res.json({ added: toAdd.length, skipped, songs: toAdd });
    }

    if (toAdd.length > 0) {
      await Library.findOneAndUpdate(
        { userId: await normalizeUserId(req.user), 'categories.id': req.params.categoryId },
        { $push: { 'categories.$.songs': { $each: toAdd } }, $set: { updatedAt: Date.now() } }
      );
    }
    res.json({ added: toAdd.length, skipped, songs: toAdd });
  } catch (e) {
    console.error('POST /library/songs/batch error:', e);
    res.status(500).json({ error: 'Failed to batch add songs' });
  }
});

router.delete('/library/categories/:categoryId/songs/:videoId', requireAuth, async (req, res) => {
  try {
    if (!process.env.MONGODB_URI) {
      const userId = await normalizeUserId(req.user); const lib = await getLibrary(userId);
      const category = lib.categories.find(c => c.id === req.params.categoryId);
      if (category) category.songs = category.songs.filter(s => s.videoId !== req.params.videoId);
      return res.json({ success: true });
    }

    await Library.findOneAndUpdate(
      { userId: await normalizeUserId(req.user), 'categories.id': req.params.categoryId },
      { $pull: { 'categories.$.songs': { videoId: req.params.videoId } }, $set: { updatedAt: Date.now() } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to remove song' });
  }
});

// ─── YOUTUBE PLAYLIST API ─────────────────────────────────────
router.get('/youtube/playlist', requireAuth, async (req, res) => {
  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'playlistId required' });
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YouTube API key not configured' });
  try {
    let songs = [], nextPageToken = null;
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('key', apiKey);
      if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      (data.items || []).forEach(item => {
        const videoId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title;
        if (videoId && title && title !== 'Deleted video' && title !== 'Private video')
          songs.push({ videoId, title });
      });
      nextPageToken = data.nextPageToken || null;
    } while (nextPageToken && songs.length < 200);
    res.json({ songs, total: songs.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});



module.exports = router