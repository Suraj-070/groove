const webpush = require('web-push')
const { PushSub } = require('../models')

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_MAILTO  = process.env.VAPID_MAILTO || 'mailto:groove@example.com'

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails((process.env.VAPID_MAILTO || 'mailto:groove@example.com'), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
}

async function sendPush(userId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log('[Push] VAPID not configured — skipping');
    return;
  }
  try {
    const subs = await PushSub.find({ userId }).lean();
    console.log(`[Push] userId="${userId}" type="${payload.type}" subs=${subs.length}`);
    if (subs.length === 0) {
      // Check if ANY subs exist in DB at all — helps diagnose save vs lookup mismatch
      const total = await PushSub.countDocuments();
      console.log(`[Push] Total subs in DB: ${total}`);
    }
    for (const sub of subs) {
      const prefs = sub.prefs || {};
      if (payload.type === 'chat'        && prefs.chatMsg    === false) continue;
      if (payload.type === 'song_added'  && prefs.songAdded  === false) continue;
      if (payload.type === 'user_joined' && prefs.userJoined === false) continue;
      if (payload.type === 'dj_crown'    && prefs.djCrown    === false) continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 60 }
        );
        console.log(`[Push] ✅ sent to ${userId}`);
      } catch (e) {
        console.log(`[Push] ❌ send failed: ${e.statusCode} ${e.message}`);
        if (e.statusCode === 404 || e.statusCode === 410) {
          await PushSub.deleteOne({ endpoint: sub.endpoint });
        }
      }
    }
  } catch (e) {
    console.error('[Push] sendPush error:', e.message);
  }
}

// Send push to all users in a room except one (the actor)
async function sendPushToRoom(roomId, exceptUserId, payload) {
  const room = rooms[roomId];
  if (!room) return;
  const userIds = Object.values(room.users)
    .filter(u => u.id !== exceptUserId && u.discordId)
    .map(u => u.discordId);
  console.log(`[Push] room="${roomId}" type="${payload.type}" targets=${JSON.stringify(userIds)}`);
  await Promise.all(userIds.map(uid => sendPush(uid, payload)));
}


module.exports = { sendPush, sendPushToRoom }
