// YouTube Queue - Background Service Worker (Manifest V3)
import { extractVideoId, buildWatchUrl, fetchVideoDetails } from '../utils/youtube.js';

const DEFAULT_SETTINGS = {
  autoplayEnabled: true,
  autoplayMode: 'video_end', // 'video_end' | 'timer'
  endDelaySeconds: 5,        // Delay before auto-playing next video when current video ends
  timerDurationSeconds: 180, // Specific playback duration before autoplaying next video
  loopQueue: false,
  respectVideoLoop: true,    // If video is looped, pause queue progression until specified
  loopCurrentVideo: false,   // Loop current video continuously
  badgeCountEnabled: true
};

// Setup right-click context menu options
function setupContextMenu() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    // 1. Right-click on any YouTube video link / thumbnail
    chrome.contextMenus.create({
      id: 'ytq_add_link_to_queue',
      title: 'Add to YouTube Queue',
      contexts: ['link'],
      targetUrlPatterns: [
        '*://*.youtube.com/watch*',
        '*://*.youtube.com/shorts*',
        '*://youtu.be/*'
      ]
    });

    // 2. Right-click on the watch page or video player
    chrome.contextMenus.create({
      id: 'ytq_add_page_to_queue',
      title: 'Add current video to Queue',
      contexts: ['page', 'video'],
      documentUrlPatterns: [
        '*://*.youtube.com/watch*',
        '*://*.youtube.com/shorts*'
      ]
    });
  });
}

// Initialize default storage on installation
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['youtubeQueue', 'currentIndex', 'settings']);
  const updates = {};

  if (!Array.isArray(data.youtubeQueue)) {
    updates.youtubeQueue = [];
  }
  if (typeof data.currentIndex !== 'number') {
    updates.currentIndex = -1;
  }
  if (!data.settings) {
    updates.settings = DEFAULT_SETTINGS;
  } else {
    updates.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  }

  await chrome.storage.local.set(updates);
  updateBadge(updates.youtubeQueue || []);
  setupContextMenu();
  console.log('[YoutubeQueue] Background worker initialized.');
});

// Also initialize context menus on worker startup
setupContextMenu();

// Update extension icon badge
async function updateBadge(queue) {
  try {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || DEFAULT_SETTINGS;

    if (!settings.badgeCountEnabled) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    const count = Array.isArray(queue) ? queue.length : 0;
    const text = count > 0 ? (count > 99 ? '99+' : count.toString()) : '';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff0033' });
  } catch (e) {
    // Ignore error if context invalidated
  }
}

// Helper to get active YouTube tab or any active tab
async function getTargetTab() {
  // First, check active tab in current window
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url && activeTab.url.includes('youtube.com')) {
    return activeTab;
  }

  // Next, check any YouTube tab in current window
  const ytTabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', currentWindow: true });
  if (ytTabs.length > 0) {
    return ytTabs[0];
  }

  return activeTab || null;
}

// Navigate tab to specified queue video and set active index
async function playQueueIndex(index, targetTabId = null) {
  const data = await chrome.storage.local.get(['youtubeQueue', 'settings']);
  const queue = data.youtubeQueue || [];
  const settings = data.settings || DEFAULT_SETTINGS;

  if (index < 0 || index >= queue.length) {
    if (settings.loopQueue && queue.length > 0) {
      index = 0;
    } else {
      console.log('[YoutubeQueue] Reached end of queue.');
      await chrome.storage.local.set({ currentIndex: -1 });
      return { success: false, reason: 'end_of_queue' };
    }
  }

  const video = queue[index];
  await chrome.storage.local.set({ currentIndex: index });

  let tab = null;
  if (targetTabId) {
    try {
      tab = await chrome.tabs.get(targetTabId);
    } catch (e) {
      tab = null;
    }
  }
  if (!tab) {
    tab = await getTargetTab();
  }

  if (tab && tab.id) {
    // Navigate tab to watch url
    await chrome.tabs.update(tab.id, { url: video.url, active: true });
    return { success: true, index, video, tabId: tab.id };
  } else {
    // Open new tab
    const newTab = await chrome.tabs.create({ url: video.url, active: true });
    return { success: true, index, video, tabId: newTab.id };
  }
}

// Play next video in queue
async function playNext(targetTabId = null) {
  const data = await chrome.storage.local.get(['youtubeQueue', 'currentIndex', 'settings']);
  const queue = data.youtubeQueue || [];
  const currentIndex = typeof data.currentIndex === 'number' ? data.currentIndex : -1;
  const nextIndex = currentIndex + 1;

  return await playQueueIndex(nextIndex, targetTabId);
}

// Play previous video in queue
async function playPrevious(targetTabId = null) {
  const data = await chrome.storage.local.get(['youtubeQueue', 'currentIndex']);
  const currentIndex = typeof data.currentIndex === 'number' ? data.currentIndex : 0;
  const prevIndex = Math.max(0, currentIndex - 1);

  return await playQueueIndex(prevIndex, targetTabId);
}

// Add video to queue
async function addToQueue(videoInput) {
  const videoId = typeof videoInput === 'string' ? extractVideoId(videoInput) : (videoInput.id || extractVideoId(videoInput.url));
  if (!videoId) {
    return { success: false, error: 'Invalid YouTube URL or ID' };
  }

  const data = await chrome.storage.local.get(['youtubeQueue']);
  const queue = data.youtubeQueue || [];

  // Check if already in queue
  const existingIdx = queue.findIndex(item => item.id === videoId);
  if (existingIdx !== -1) {
    return { success: false, alreadyInQueue: true, index: existingIdx, item: queue[existingIdx] };
  }

  // Fetch details if not fully provided
  let item = null;
  if (videoInput.title && videoInput.thumbnail) {
    item = {
      id: videoId,
      url: buildWatchUrl(videoId),
      title: videoInput.title,
      channel: videoInput.channel || 'YouTube',
      thumbnail: videoInput.thumbnail,
      addedAt: Date.now()
    };
  } else {
    item = await fetchVideoDetails(videoId, videoInput.title || '');
  }

  queue.push(item);
  await chrome.storage.local.set({ youtubeQueue: queue });
  updateBadge(queue);

  return { success: true, item, queueLength: queue.length };
}

// Listen to messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request.action;

  (async () => {
    switch (action) {
      case 'GET_STATE': {
        const data = await chrome.storage.local.get(['youtubeQueue', 'currentIndex', 'settings']);
        sendResponse({
          queue: data.youtubeQueue || [],
          currentIndex: typeof data.currentIndex === 'number' ? data.currentIndex : -1,
          settings: data.settings || DEFAULT_SETTINGS
        });
        break;
      }

      case 'ADD_TO_QUEUE': {
        const res = await addToQueue(request.video);
        sendResponse(res);
        break;
      }

      case 'REMOVE_FROM_QUEUE': {
        const data = await chrome.storage.local.get(['youtubeQueue', 'currentIndex']);
        let queue = data.youtubeQueue || [];
        let currentIndex = data.currentIndex || -1;
        const removeIndex = request.index;

        if (removeIndex >= 0 && removeIndex < queue.length) {
          queue.splice(removeIndex, 1);
          if (currentIndex === removeIndex) {
            currentIndex = -1;
          } else if (currentIndex > removeIndex) {
            currentIndex--;
          }
          await chrome.storage.local.set({ youtubeQueue: queue, currentIndex });
          updateBadge(queue);
          sendResponse({ success: true, queue, currentIndex });
        } else {
          sendResponse({ success: false, error: 'Index out of bounds' });
        }
        break;
      }

      case 'REORDER_QUEUE': {
        const { fromIndex, toIndex } = request;
        const data = await chrome.storage.local.get(['youtubeQueue', 'currentIndex']);
        let queue = data.youtubeQueue || [];
        let currentIndex = data.currentIndex || -1;

        if (
          fromIndex >= 0 && fromIndex < queue.length &&
          toIndex >= 0 && toIndex < queue.length
        ) {
          const [movedItem] = queue.splice(fromIndex, 1);
          queue.splice(toIndex, 0, movedItem);

          // Update currentIndex to follow the playing item
          if (currentIndex === fromIndex) {
            currentIndex = toIndex;
          } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
            currentIndex--;
          } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
            currentIndex++;
          }

          await chrome.storage.local.set({ youtubeQueue: queue, currentIndex });
          sendResponse({ success: true, queue, currentIndex });
        } else {
          sendResponse({ success: false, error: 'Invalid indices' });
        }
        break;
      }

      case 'CLEAR_QUEUE': {
        await chrome.storage.local.set({ youtubeQueue: [], currentIndex: -1 });
        updateBadge([]);
        sendResponse({ success: true });
        break;
      }

      case 'PLAY_INDEX': {
        const tabId = sender.tab ? sender.tab.id : null;
        const res = await playQueueIndex(request.index, tabId);
        sendResponse(res);
        break;
      }

      case 'PLAY_NEXT': {
        const tabId = sender.tab ? sender.tab.id : null;
        const res = await playNext(tabId);
        sendResponse(res);
        break;
      }

      case 'PLAY_PREV': {
        const tabId = sender.tab ? sender.tab.id : null;
        const res = await playPrevious(tabId);
        sendResponse(res);
        break;
      }

      case 'UPDATE_SETTINGS': {
        const data = await chrome.storage.local.get(['settings', 'youtubeQueue']);
        const updated = { ...(data.settings || DEFAULT_SETTINGS), ...(request.settings || {}) };
        await chrome.storage.local.set({ settings: updated });
        updateBadge(data.youtubeQueue || []);
        sendResponse({ success: true, settings: updated });
        break;
      }

      case 'CONTENT_VIDEO_ENDED': {
        // Sent from content script when a video finishes
        const data = await chrome.storage.local.get(['settings', 'youtubeQueue', 'currentIndex']);
        const settings = data.settings || DEFAULT_SETTINGS;
        const queue = data.youtubeQueue || [];
        const currentIndex = typeof data.currentIndex === 'number' ? data.currentIndex : -1;

        if (!settings.autoplayEnabled) {
          sendResponse({ handled: false, reason: 'autoplay_disabled' });
          return;
        }

        // Check if video is looped
        const isLooped = request.isLooped || (settings.respectVideoLoop && settings.loopCurrentVideo);
        if (isLooped && settings.respectVideoLoop) {
          console.log('[YoutubeQueue] Video is looped. Holding queue on current item.');
          sendResponse({ handled: false, reason: 'video_is_looped' });
          return;
        }

        // Only autoplay if in video_end mode and there is a next video
        const hasNext = currentIndex + 1 < queue.length || (settings.loopQueue && queue.length > 0);
        if (hasNext) {
          const tabId = sender.tab ? sender.tab.id : null;
          const res = await playNext(tabId);
          sendResponse({ handled: true, playResult: res });
        } else {
          sendResponse({ handled: false, reason: 'no_more_videos' });
        }
        break;
      }

      case 'TIMER_AUTOPLAY_NEXT': {
        // Sent when fixed time duration limit is reached
        const data = await chrome.storage.local.get(['settings', 'youtubeQueue', 'currentIndex']);
        const settings = data.settings || DEFAULT_SETTINGS;
        const queue = data.youtubeQueue || [];
        const currentIndex = typeof data.currentIndex === 'number' ? data.currentIndex : -1;

        if (!settings.autoplayEnabled) {
          sendResponse({ handled: false, reason: 'autoplay_disabled' });
          return;
        }

        const isLooped = request.isLooped || (settings.respectVideoLoop && settings.loopCurrentVideo);
        if (isLooped && settings.respectVideoLoop) {
          console.log('[YoutubeQueue] Video is looped. Holding queue on current item.');
          sendResponse({ handled: false, reason: 'video_is_looped' });
          return;
        }

        const hasNext = currentIndex + 1 < queue.length || (settings.loopQueue && queue.length > 0);
        if (hasNext) {
          const tabId = sender.tab ? sender.tab.id : null;
          const res = await playNext(tabId);
          sendResponse({ handled: true, playResult: res });
        } else {
          sendResponse({ handled: false, reason: 'no_more_videos' });
        }
        break;
      }

      case 'REPORT_CURRENT_VIDEO': {
        // Content script reports the active video ID on the page
        const videoId = request.videoId;
        if (videoId) {
          const data = await chrome.storage.local.get(['youtubeQueue', 'currentIndex']);
          const queue = data.youtubeQueue || [];
          const idx = queue.findIndex(item => item.id === videoId);
          if (idx !== -1 && idx !== data.currentIndex) {
            await chrome.storage.local.set({ currentIndex: idx });
          }
        }
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();

  return true; // Keep channel open for async response
});

// Update badge when storage changes directly
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.youtubeQueue) {
    updateBadge(changes.youtubeQueue.newValue || []);
  }
});

// Handle right-click context menu clicks
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ytq_add_link_to_queue' || info.menuItemId === 'ytq_add_page_to_queue') {
    const rawUrl = info.linkUrl || info.srcUrl || info.pageUrl || (tab ? tab.url : null);
    if (!rawUrl) return;

    const res = await addToQueue(rawUrl);

    // Notify tab to display on-screen toast notification
    if (tab && tab.id) {
      const itemTitle = res.item ? res.item.title : 'Video';
      const truncatedTitle = itemTitle.length > 35 ? itemTitle.slice(0, 35) + '...' : itemTitle;
      const message = res.alreadyInQueue
        ? `"${truncatedTitle}" already in queue!`
        : (res.success ? `Added "${truncatedTitle}" to queue!` : (res.error || 'Could not add video to queue'));
      const toastType = res.alreadyInQueue ? 'info' : (res.success ? 'success' : 'info');

      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'SHOW_TOAST',
          message,
          toastType
        });
      } catch (err) {
        // Content script may not be loaded on this tab
      }
    }
  }
});

