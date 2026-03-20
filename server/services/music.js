const { SongDNA } = require('../models')

// ── Map Last.fm tags → mood/energy/danceability ─────────────
function mapLastFmTags(tags = []) {
  const t = tags.map(t => (t.name || '').toLowerCase());
  const has = (...words) => words.some(w => t.some(tag => tag.includes(w)));

  let mood = 'neutral';
  let energy = 0.5;
  let danceability = 0.5;

  // Mood
  if (has('sad', 'melanchol', 'heartbreak', 'emotional', 'crying', 'depressing')) mood = 'sad';
  else if (has('happy', 'euphoric', 'uplifting', 'feel good', 'joyful', 'positive')) mood = 'euphoric';
  else if (has('chill', 'relax', 'calm', 'peaceful', 'ambient', 'sleep', 'lofi', 'lo-fi')) mood = 'chill';
  else if (has('aggressive', 'angry', 'intense', 'rage', 'metal', 'hardcore')) mood = 'aggressive';
  else if (has('romantic', 'love', 'sensual', 'smooth')) mood = 'romantic';

  // Energy
  if (has('energetic', 'pump', 'workout', 'hype', 'intense', 'power', 'edm', 'dubstep', 'drum and bass', 'dnb', 'hardstyle')) energy = 0.9;
  else if (has('party', 'dance', 'club', 'banger', 'trap', 'hip hop', 'hip-hop')) energy = 0.75;
  else if (has('chill', 'relax', 'ambient', 'lofi', 'lo-fi', 'sleep', 'study')) energy = 0.2;
  else if (has('indie', 'acoustic', 'folk', 'soft', 'mellow', 'slow')) energy = 0.35;

  // Danceability
  if (has('dance', 'club', 'edm', 'house', 'techno', 'disco', 'funk', 'groove', 'afrobeats')) danceability = 0.9;
  else if (has('hip hop', 'hip-hop', 'trap', 'r&b', 'rnb', 'pop')) danceability = 0.72;
  else if (has('ballad', 'acoustic', 'classical', 'ambient', 'lofi')) danceability = 0.2;

  return { mood, energy, danceability };
}

// ── Estimate BPM from title keywords ─────────────────────────
function estimateBpmFromTitle(title = '') {
  const t = title.toLowerCase();
  if (t.includes('slowed')) return 65;
  if (t.includes('nightcore')) return 160;
  if (t.includes('lofi') || t.includes('lo-fi')) return 85;
  if (t.includes('drum and bass') || t.includes('dnb')) return 174;
  if (t.includes('hardstyle')) return 150;
  if (t.includes('dubstep')) return 140;
  if (t.includes('house')) return 125;
  if (t.includes('techno')) return 135;
  if (t.includes('trap')) return 70;
  if (t.includes('drill')) return 145;
  if (t.includes('reggaeton')) return 95;
  if (t.includes('ballad') || t.includes('acoustic')) return 75;
  return null;
}

async function enrichSong(videoId, title) {
  // Check cache first
  if (MONGO_URI) {
    const cached = await SongDNA.findOne({ videoId }).lean();
    if (cached) return cached;
  }

  const dna = { videoId, title, bpm: null, energy: 0.5, mood: 'neutral', danceability: 0.5, genre: null, category: null };

  try {
    const clean = (title || '').replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 80);

    // ── 1. Deezer — BPM, gain, genre (no API key needed) ─────
    try {
      const dzRes = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(clean)}&limit=1&output=json`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000) }
      );
      if (dzRes.ok) {
        const dzData = await dzRes.json();
        const track = dzData?.data?.[0];
        if (track) {
          if (track.bpm && track.bpm > 40 && track.bpm < 220) dna.bpm = Math.round(track.bpm);
          if (track.gain != null) {
            // gain is in dB (-15 to +5 range) — normalize to 0-1 energy
            dna.energy = Math.min(1, Math.max(0, (track.gain + 15) / 20));
          }
          if (track.album?.genre_id && track.album.genre_id > 0) {
            // Map Deezer genre IDs to names
            const genreMap = { 132:'pop', 116:'rap', 152:'electro', 113:'dance', 129:'jazz',
              98:'classical', 144:'reggae', 197:'latin', 165:'soul', 85:'alternative',
              100:'folk', 173:'r&b', 106:'rock', 169:'metal' };
            dna.genre = genreMap[track.album.genre_id] || null;
          }
        }
      }
    } catch { /* Deezer is best-effort */ }

    // ── 2. Last.fm — mood, energy refinement, genre tags ─────
    if (process.env.LASTFM_API_KEY) {
      try {
        const lfRes = await fetch(
          `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(clean)}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (lfRes.ok) {
          const lfSearch = await lfRes.json();
          const match = lfSearch?.results?.trackmatches?.track?.[0];
          if (match?.name && match?.artist) {
            // Get top tags for the track
            const tagsRes = await fetch(
              `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&track=${encodeURIComponent(match.name)}&artist=${encodeURIComponent(match.artist)}&api_key=${process.env.LASTFM_API_KEY}&format=json`,
              { signal: AbortSignal.timeout(4000) }
            );
            if (tagsRes.ok) {
              const tagsData = await tagsRes.json();
              const tags = tagsData?.toptags?.tag || [];
              // Only use tags with count > 10 (more reliable)
              const goodTags = tags.filter(t => parseInt(t.count) > 10);
              const mapped = mapLastFmTags(goodTags);
              dna.mood = mapped.mood;
              // Refine energy — Deezer gain wins if available, else use Last.fm
              if (dna.energy === 0.5) dna.energy = mapped.energy;
              dna.danceability = mapped.danceability;
              // Genre from tags if Deezer didn't give one
              if (!dna.genre && goodTags.length > 0) {
                dna.genre = goodTags[0].name.toLowerCase();
              }
            }
          }
        }
      } catch { /* Last.fm is best-effort */ }
    }

    // ── 3. BPM fallback from title keywords ──────────────────
    if (!dna.bpm) {
      const titleBpm = estimateBpmFromTitle(title);
      if (titleBpm) dna.bpm = titleBpm;
    }

    // ── 4. YouTube tags for category ─────────────────────────
    let ytTags = [];
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          ytTags = ytData.items?.[0]?.snippet?.tags || [];
        }
      } catch {}
    }
    dna.category = deriveCategory(dna, ytTags);

    // ── 5. Cache in MongoDB ───────────────────────────────────
    if (MONGO_URI) {
      await SongDNA.findOneAndUpdate(
        { videoId },
        { ...dna, fetchedAt: Date.now() },
        { upsert: true }
      );
    }
  } catch (e) { /* enrichment is always best-effort — never block playback */ }

  return dna;
}

// Flow score between two songs (0-100)
function flowScore(songA, songB) {
  if (!songA || !songB) return 50;
  let score = 100;
  // BPM compatibility (within 20 BPM = smooth, >40 BPM = jarring)
  if (songA.bpm && songB.bpm) {
    const bpmDiff = Math.abs(songA.bpm - songB.bpm);
    score -= Math.min(40, bpmDiff * 1.2);
  }
  // Energy delta
  if (songA.energy != null && songB.energy != null) {
    const eDiff = Math.abs(songA.energy - songB.energy);
    score -= eDiff * 30;
  }
  // Mood compatibility
  const moodCompat = {
    euphoric: { euphoric:10, confident:5, chill:-5, sad:-15, aggressive:0, neutral:0 },
    confident:{ euphoric:5, confident:10, chill:0, sad:-10, aggressive:5, neutral:3 },
    chill:    { euphoric:-5, confident:0, chill:10, sad:5, aggressive:-15, neutral:5 },
    sad:      { euphoric:-15, confident:-10, chill:5, sad:10, aggressive:-10, neutral:0 },
    aggressive:{ euphoric:0, confident:5, chill:-15, sad:-10, aggressive:10, neutral:0 },
    neutral:  { euphoric:0, confident:3, chill:5, sad:0, aggressive:0, neutral:10 },
  };
  const moodDelta = moodCompat[songA.mood]?.[songB.mood] ?? 0;
  score += moodDelta;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Derive human-readable category from DNA + YouTube tags
function deriveCategory(dna, ytTags = []) {
  const { bpm, mood, danceability, energy, genre } = dna;
  const tags = (ytTags || []).join(' ').toLowerCase();
  const titleLower = (dna.title || '').toLowerCase();
  const combined = tags + ' ' + titleLower;

  // YouTube tag heuristics (strong signal — music videos tag themselves)
  if (/sad|heartbreak|crying|emotional|breakup|grief|miss you/.test(combined)) return 'Sad';
  if (/lo.?fi|study|focus|concentration|work|deep work/.test(combined)) return 'Focus';
  if (/workout|gym|beast mode|motivation|hype|rage|aggressive/.test(combined)) return 'Hype';
  if (/chill|relax|calm|ambient|peaceful|sleep|night/.test(combined)) return 'Chill';
  if (/party|club|dance|EDM|rave|festival|banger/.test(combined)) return 'Party';
  if (/love|romantic|romance|wedding|R&B|soul/.test(combined)) return 'Romance';
  if (/hip.?hop|rap|trap|drill|freestyle|cypher/.test(combined)) return 'Hip-Hop';
  if (/feel good|happy|summer|good vibes|positive|upbeat/.test(combined)) return 'Feel Good';

  // Deezer + Last.fm data
  if (mood === 'sad' || energy < 0.25) return 'Sad';
  if (bpm && bpm < 80 && mood !== 'sad' && energy < 0.45) return 'Chill';
  if (bpm && bpm < 90 && danceability < 0.4 && energy < 0.5) return 'Focus';
  if (bpm && bpm > 145 && energy > 0.7) return 'Hype';
  if (danceability > 0.72 && bpm > 118 && energy > 0.65) return 'Party';
  if (mood === 'euphoric' && danceability > 0.55) return 'Feel Good';
  if (mood === 'confident' && bpm > 85) return 'Hip-Hop';
  if (energy > 0.4 && energy < 0.65 && mood !== 'aggressive') return 'Chill';

  // Genre fallback
  if (genre) {
    if (/hip|rap/.test(genre)) return 'Hip-Hop';
    if (/dan|elec/.test(genre)) return 'Party';
    if (/roc/.test(genre)) return 'Hype';
    if (/cla|jaz/.test(genre)) return 'Focus';
    if (/r.b|sou/.test(genre)) return 'Romance';
  }

  return 'Vibes'; // catch-all
}


module.exports = { mapLastFmTags, estimateBpmFromTitle, enrichSong, flowScore, deriveCategory }
