// YouTube Queue - Shared Utility Functions

/**
 * Extracts YouTube video ID from various URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * @param {string} url
 * @returns {string|null} 11-character video ID or null
 */
function extractVideoId(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // youtu.be/<id>
    if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
      const id = parsed.pathname.slice(1).split(/[?#&/]/)[0];
      return isValidVideoId(id) ? id : null;
    }

    // youtube.com variants
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      // /watch?v=<id>
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return isValidVideoId(id) ? id : null;
      }

      // /shorts/<id>
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.replace('/shorts/', '').split(/[?#&/]/)[0];
        return isValidVideoId(id) ? id : null;
      }

      // /embed/<id> or /v/<id>
      if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/v/')) {
        const parts = parsed.pathname.split('/');
        const id = parts[2] ? parts[2].split(/[?#&]/)[0] : null;
        return isValidVideoId(id) ? id : null;
      }
    }
  } catch (e) {
    // URL parsing failed, try regex match fallback
  }

  // Regex fallback
  const regex = /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = url.match(regex);
  return match && match[1] && isValidVideoId(match[1]) ? match[1] : null;
}

/**
 * Validates 11-char YouTube ID format
 */
function isValidVideoId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/**
 * Generates standard watch URL
 */
function buildWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Gets best thumbnail URL for video ID
 */
function getThumbnailUrl(videoId, quality = 'mqdefault') {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Fetches video metadata (title, author) via YouTube oEmbed API without API key
 * Falls back gracefully if request fails.
 */
async function fetchVideoDetails(videoId, fallbackTitle = '') {
  const watchUrl = buildWatchUrl(videoId);
  const defaultThumbnail = getThumbnailUrl(videoId, 'mqdefault');

  let title = fallbackTitle || `YouTube Video (${videoId})`;
  let channel = 'YouTube';

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.title) title = data.title;
      if (data.author_name) channel = data.author_name;
    } else {
      // Try noembed fallback
      const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`;
      const res2 = await fetch(noembedUrl);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2.title) title = data2.title;
        if (data2.author_name) channel = data2.author_name;
      }
    }
  } catch (err) {
    console.warn('[YoutubeQueue] Could not fetch oEmbed metadata:', err);
  }

  return {
    id: videoId,
    url: watchUrl,
    title: title.trim(),
    channel: channel.trim(),
    thumbnail: defaultThumbnail,
    addedAt: Date.now()
  };
}

/**
 * Formats seconds into MM:SS or HH:MM:SS
 */
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Export for ES modules
export {
  extractVideoId,
  isValidVideoId,
  buildWatchUrl,
  getThumbnailUrl,
  fetchVideoDetails,
  formatTime
};

// Export for window object if accessed in non-module scripts
if (typeof window !== 'undefined') {
  window.YTQUtils = { extractVideoId, isValidVideoId, buildWatchUrl, getThumbnailUrl, fetchVideoDetails, formatTime };
}

