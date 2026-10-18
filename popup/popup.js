// YouTube Queue - Popup UI Controller
import { extractVideoId, buildWatchUrl } from '../utils/youtube.js';

document.addEventListener('DOMContentLoaded', async () => {

  // DOM Elements
  const queueList = document.getElementById('queueList');
  const emptyState = document.getElementById('emptyState');
  const queueCounter = document.getElementById('queueCounter');
  const btnCopyCurrentUrl = document.getElementById('btnCopyCurrentUrl');
  const formAddManual = document.getElementById('formAddManual');
  const inputManualUrl = document.getElementById('inputManualUrl');
  const btnClearQueue = document.getElementById('btnClearQueue');
  const btnSettingsToggle = document.getElementById('btnSettingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const btnShuffle = document.getElementById('btnShuffle');
  const toast = document.getElementById('toast');

  // Now Playing Bar Elements
  const nowPlayingBar = document.getElementById('nowPlayingBar');
  const npThumbnail = document.getElementById('npThumbnail');
  const npTitle = document.getElementById('npTitle');
  const npChannel = document.getElementById('npChannel');
  const npBtnPrev = document.getElementById('npBtnPrev');
  const npBtnNext = document.getElementById('npBtnNext');
  const npBtnLoopVideo = document.getElementById('npBtnLoopVideo');
  const npLoopedBadge = document.getElementById('npLoopedBadge');

  // Settings Elements
  const toggleAutoplay = document.getElementById('toggleAutoplay');
  const selectAutoplayMode = document.getElementById('selectAutoplayMode');
  const rowEndDelay = document.getElementById('rowEndDelay');
  const rowTimerDuration = document.getElementById('rowTimerDuration');
  const delayPresets = document.getElementById('delayPresets');
  const timerPresets = document.getElementById('timerPresets');
  const toggleLoop = document.getElementById('toggleLoop');
  const toggleRespectLoop = document.getElementById('toggleRespectLoop');
  const toggleLoopCurrentVideo = document.getElementById('toggleLoopCurrentVideo');

  // Local State
  let queue = [];
  let currentIndex = -1;
  let settings = {
    autoplayEnabled: true,
    autoplayMode: 'video_end',
    endDelaySeconds: 5,
    timerDurationSeconds: 180,
    loopQueue: false,
    respectVideoLoop: true,
    loopCurrentVideo: false
  };

  let draggedItemIndex = null;
  let toastTimeout = null;

  // Show Toast
  function showToast(message, duration = 3000) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.remove('hidden');
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  // Load Initial State
  async function loadState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
      if (response) {
        queue = response.queue || [];
        currentIndex = typeof response.currentIndex === 'number' ? response.currentIndex : -1;
        settings = response.settings || settings;
        renderSettings();
        renderQueue();
      }
    } catch (e) {
      console.error('[YoutubeQueue] Error fetching state:', e);
    }
  }

  // Render Settings UI
  function renderSettings() {
    toggleAutoplay.checked = !!settings.autoplayEnabled;
    selectAutoplayMode.value = settings.autoplayMode || 'video_end';
    toggleLoop.checked = !!settings.loopQueue;
    if (toggleRespectLoop) toggleRespectLoop.checked = settings.respectVideoLoop !== false;
    if (toggleLoopCurrentVideo) toggleLoopCurrentVideo.checked = !!settings.loopCurrentVideo;

    if (settings.autoplayMode === 'timer') {
      rowEndDelay.style.display = 'none';
      rowTimerDuration.style.display = 'flex';
    } else {
      rowEndDelay.style.display = 'flex';
      rowTimerDuration.style.display = 'none';
    }

    // Update Delay Presets
    Array.from(delayPresets.querySelectorAll('.preset-btn')).forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val, 10) === settings.endDelaySeconds);
    });

    // Update Timer Presets
    Array.from(timerPresets.querySelectorAll('.preset-btn')).forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val, 10) === settings.timerDurationSeconds);
    });
  }

  // Render Queue List
  function renderQueue() {
    queueCounter.textContent = `${queue.length} video${queue.length === 1 ? '' : 's'}`;

    // Render Now Playing Bar
    if (currentIndex >= 0 && currentIndex < queue.length) {
      const currentVideo = queue[currentIndex];
      nowPlayingBar.classList.remove('hidden');
      npThumbnail.src = currentVideo.thumbnail || `https://img.youtube.com/vi/${currentVideo.id}/mqdefault.jpg`;
      npTitle.textContent = currentVideo.title;
      npChannel.textContent = currentVideo.channel || 'YouTube';

      const isLooped = !!settings.loopCurrentVideo;
      if (npBtnLoopVideo) {
        npBtnLoopVideo.classList.toggle('active', isLooped);
        npBtnLoopVideo.title = isLooped
          ? 'Current video loop is ACTIVE (Queue will not advance). Click to disable.'
          : 'Loop Current Video (Queue won\'t advance until turned off or Next is clicked)';
      }
      if (npLoopedBadge) {
        npLoopedBadge.classList.toggle('hidden', !isLooped);
      }

      // Check active tab if video.loop is set natively on YouTube
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab && tab.id && tab.url && tab.url.includes('youtube.com')) {
          chrome.tabs.sendMessage(tab.id, { action: 'QUERY_VIDEO_LOOP' }, (res) => {
            if (!chrome.runtime.lastError && res) {
              const activeLooped = res.looped || isLooped;
              if (npBtnLoopVideo) npBtnLoopVideo.classList.toggle('active', activeLooped);
              if (npLoopedBadge) npLoopedBadge.classList.toggle('hidden', !activeLooped);
            }
          });
        }
      });
    } else {
      nowPlayingBar.classList.add('hidden');
    }

    // Render Empty State or List
    if (queue.length === 0) {
      queueList.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    queueList.innerHTML = '';

    queue.forEach((item, index) => {
      const isPlaying = index === currentIndex;
      const el = document.createElement('div');
      el.className = `queue-item ${isPlaying ? 'is-playing' : ''}`;
      el.draggable = true;
      el.dataset.index = index;

      el.innerHTML = `
        <div class="drag-handle" title="Drag to reorder">
          <svg viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </div>
        <span class="item-index">${index + 1}</span>
        <div class="item-thumb-wrapper" title="Click to play">
          <img class="item-thumb" src="${escapeHTML(item.thumbnail)}" alt="thumb" loading="lazy" />
          <div class="thumb-play-overlay">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="item-details" title="${escapeHTML(item.title)}">
          <div class="item-title">${escapeHTML(item.title)}</div>
          <div class="item-channel">${escapeHTML(item.channel || 'YouTube')}</div>
        </div>
        <div class="item-actions">
          <button class="btn-item-action btn-move-up" title="Move Up" ${index === 0 ? 'disabled style="opacity:0.2;"' : ''}>
            <svg viewBox="0 0 24 24"><path d="M7 14l5-5 5 5z"/></svg>
          </button>
          <button class="btn-item-action btn-move-down" title="Move Down" ${index === queue.length - 1 ? 'disabled style="opacity:0.2;"' : ''}>
            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
          <button class="btn-item-action delete btn-delete-item" title="Delete from Queue">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;

      // Play on thumb or title click
      el.querySelector('.item-thumb-wrapper').addEventListener('click', () => playItem(index));
      el.querySelector('.item-details').addEventListener('click', () => playItem(index));

      // Move Up
      el.querySelector('.btn-move-up').addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) reorderItems(index, index - 1);
      });

      // Move Down
      el.querySelector('.btn-move-down').addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < queue.length - 1) reorderItems(index, index + 1);
      });

      // Delete Item
      el.querySelector('.btn-delete-item').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(index);
      });

      // Drag and Drop Events
      el.addEventListener('dragstart', (e) => {
        draggedItemIndex = index;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        clearDragStyles();
        draggedItemIndex = null;
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          el.classList.add('drag-over-top');
          el.classList.remove('drag-over-bottom');
        } else {
          el.classList.add('drag-over-bottom');
          el.classList.remove('drag-over-top');
        }
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over-top', 'drag-over-bottom');
        if (draggedItemIndex === null || draggedItemIndex === index) return;

        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let targetIndex = e.clientY < midY ? index : index + 1;

        if (draggedItemIndex < targetIndex) {
          targetIndex--;
        }

        if (draggedItemIndex !== targetIndex) {
          reorderItems(draggedItemIndex, targetIndex);
        }
      });

      queueList.appendChild(el);
    });
  }

  function clearDragStyles() {
    Array.from(queueList.querySelectorAll('.queue-item')).forEach(item => {
      item.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
  }

  // Play specified item
  async function playItem(index) {
    const res = await chrome.runtime.sendMessage({ action: 'PLAY_INDEX', index });
    if (res && res.success) {
      currentIndex = index;
      renderQueue();
      showToast(`Playing video #${index + 1}`);
    }
  }

  // Delete item
  async function deleteItem(index) {
    const removedTitle = queue[index] ? queue[index].title : 'video';
    const res = await chrome.runtime.sendMessage({ action: 'REMOVE_FROM_QUEUE', index });
    if (res && res.success) {
      queue = res.queue;
      currentIndex = res.currentIndex;
      renderQueue();
      showToast(`Removed "${truncate(removedTitle, 25)}" from queue`);
    }
  }

  // Reorder items
  async function reorderItems(fromIndex, toIndex) {
    const res = await chrome.runtime.sendMessage({
      action: 'REORDER_QUEUE',
      fromIndex,
      toIndex
    });
    if (res && res.success) {
      queue = res.queue;
      currentIndex = res.currentIndex;
      renderQueue();
    }
  }

  // Copy Current Viewed URL & Add to Queue
  btnCopyCurrentUrl.addEventListener('click', async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.url) {
        showToast('No active tab found');
        return;
      }

      const videoId = extractVideoId ? extractVideoId(activeTab.url) : null;
      if (!videoId) {
        showToast('Active tab is not a YouTube video!');
        inputManualUrl.focus();
        return;
      }

      const cleanUrl = buildWatchUrl ? buildWatchUrl(videoId) : `https://www.youtube.com/watch?v=${videoId}`;

      // 1. Copy cleanly to clipboard
      await navigator.clipboard.writeText(cleanUrl);

      // 2. Add to Queue
      const cleanTitle = activeTab.title ? activeTab.title.replace(' - YouTube', '').trim() : '';
      const res = await chrome.runtime.sendMessage({
        action: 'ADD_TO_QUEUE',
        video: {
          id: videoId,
          url: cleanUrl,
          title: cleanTitle,
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        }
      });

      if (res && res.alreadyInQueue) {
        showToast('📋 URL copied to clipboard! (Already in queue)');
      } else if (res && res.success) {
        showToast('📋 URL copied to clipboard & added to queue!');
        await loadState();
      } else {
        showToast('URL copied to clipboard!');
      }
    } catch (err) {
      console.error('[YoutubeQueue] Copy & Add error:', err);
      showToast('Could not access active tab or clipboard');
    }
  });

  // Manual Add Form
  formAddManual.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawInput = inputManualUrl.value.trim();
    if (!rawInput) return;

    const videoId = extractVideoId ? extractVideoId(rawInput) : null;
    if (!videoId) {
      showToast('Please enter a valid YouTube video link');
      return;
    }

    inputManualUrl.value = '';
    const res = await chrome.runtime.sendMessage({
      action: 'ADD_TO_QUEUE',
      video: rawInput
    });

    if (res && res.alreadyInQueue) {
      showToast('Video is already in queue!');
    } else if (res && res.success) {
      showToast('Added video to queue!');
      await loadState();
    } else {
      showToast(res.error || 'Failed to add video');
    }
  });

  // Clear Queue
  btnClearQueue.addEventListener('click', async () => {
    if (queue.length === 0) {
      showToast('Queue is already empty');
      return;
    }
    if (confirm('Clear all videos from your queue?')) {
      await chrome.runtime.sendMessage({ action: 'CLEAR_QUEUE' });
      queue = [];
      currentIndex = -1;
      renderQueue();
      showToast('Queue cleared');
    }
  });

  // Shuffle Queue
  btnShuffle.addEventListener('click', async () => {
    if (queue.length <= 1) {
      showToast('Need at least 2 videos to shuffle');
      return;
    }

    // Keep current playing video in place, shuffle the rest
    const remaining = queue.filter((_, idx) => idx !== currentIndex);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    let newQueue = [];
    if (currentIndex >= 0 && currentIndex < queue.length) {
      newQueue = [queue[currentIndex], ...remaining];
      currentIndex = 0;
    } else {
      newQueue = remaining;
    }

    queue = newQueue;
    await chrome.storage.local.set({ youtubeQueue: queue, currentIndex });
    renderQueue();
    showToast('Queue shuffled');
  });

  // Toggle Settings Panel
  btnSettingsToggle.addEventListener('click', () => {
    const isHidden = settingsPanel.classList.toggle('hidden');
    btnSettingsToggle.classList.toggle('active', !isHidden);
  });

  // Settings: Autoplay Toggle
  toggleAutoplay.addEventListener('change', async () => {
    settings.autoplayEnabled = toggleAutoplay.checked;
    await updateSettings({ autoplayEnabled: settings.autoplayEnabled });
    showToast(`Autoplay ${settings.autoplayEnabled ? 'enabled' : 'disabled'}`);
  });

  // Settings: Mode Select
  selectAutoplayMode.addEventListener('change', async () => {
    settings.autoplayMode = selectAutoplayMode.value;
    if (settings.autoplayMode === 'timer') {
      rowEndDelay.style.display = 'none';
      rowTimerDuration.style.display = 'flex';
    } else {
      rowEndDelay.style.display = 'flex';
      rowTimerDuration.style.display = 'none';
    }
    await updateSettings({ autoplayMode: settings.autoplayMode });
    showToast(`Autoplay trigger set to: ${settings.autoplayMode === 'timer' ? 'Specific Time Limit' : 'When Video Ends'}`);
  });

  // Settings: End Delay Presets
  delayPresets.addEventListener('click', async (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const val = parseInt(btn.dataset.val, 10);
    settings.endDelaySeconds = val;
    Array.from(delayPresets.querySelectorAll('.preset-btn')).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    await updateSettings({ endDelaySeconds: val });
    showToast(`Autoplay countdown delay: ${val}s`);
  });

  // Settings: Timer Duration Presets
  timerPresets.addEventListener('click', async (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const val = parseInt(btn.dataset.val, 10);
    settings.timerDurationSeconds = val;
    Array.from(timerPresets.querySelectorAll('.preset-btn')).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    await updateSettings({ timerDurationSeconds: val });
    showToast(`Play limit set to: ${val >= 60 ? `${val / 60}m` : `${val}s`}`);
  });

  // Settings: Loop Queue Toggle
  toggleLoop.addEventListener('change', async () => {
    settings.loopQueue = toggleLoop.checked;
    await updateSettings({ loopQueue: settings.loopQueue });
    showToast(`Loop queue ${settings.loopQueue ? 'enabled' : 'disabled'}`);
  });

  // Settings: Respect Looped Video Toggle
  if (toggleRespectLoop) {
    toggleRespectLoop.addEventListener('change', async () => {
      settings.respectVideoLoop = toggleRespectLoop.checked;
      await updateSettings({ respectVideoLoop: settings.respectVideoLoop });
      showToast(
        settings.respectVideoLoop
          ? 'Queue will pause when video is looped'
          : 'Queue will advance even if video is looped'
      );
    });
  }

  // Settings: Loop Current Video Toggle
  if (toggleLoopCurrentVideo) {
    toggleLoopCurrentVideo.addEventListener('change', async () => {
      const newLoopState = toggleLoopCurrentVideo.checked;
      settings.loopCurrentVideo = newLoopState;

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab && tab.id && tab.url && tab.url.includes('youtube.com')) {
          chrome.tabs.sendMessage(tab.id, { action: 'SET_VIDEO_LOOP', loop: newLoopState });
        }
      });

      await updateSettings({ loopCurrentVideo: newLoopState });
      renderQueue();
      showToast(
        newLoopState
          ? '🔂 Current video will loop continuously'
          : 'Current video loop disabled'
      );
    });
  }

  // Now Playing: Loop Current Video Button
  if (npBtnLoopVideo) {
    npBtnLoopVideo.addEventListener('click', async () => {
      const newLoopState = !settings.loopCurrentVideo;
      settings.loopCurrentVideo = newLoopState;

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab && tab.id && tab.url && tab.url.includes('youtube.com')) {
          chrome.tabs.sendMessage(tab.id, { action: 'SET_VIDEO_LOOP', loop: newLoopState });
        }
      });

      await updateSettings({ loopCurrentVideo: newLoopState });
      renderQueue();
      renderSettings();
      showToast(
        newLoopState
          ? '🔂 Loop active: Video will repeat without advancing queue'
          : 'Loop disabled: Queue will advance normally'
      );
    });
  }

  // Save Settings Helper
  async function updateSettings(newSettings) {
    const res = await chrome.runtime.sendMessage({
      action: 'UPDATE_SETTINGS',
      settings: newSettings
    });
    if (res && res.settings) {
      settings = res.settings;
    }
  }

  // Now Playing Controls
  npBtnPrev.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'PLAY_PREV' });
    if (res && res.success) {
      currentIndex = res.index;
      renderQueue();
    }
  });

  npBtnNext.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'PLAY_NEXT' });
    if (res && res.success) {
      currentIndex = res.index;
      renderQueue();
    }
  });

  // Utilities
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  function truncate(str, max = 30) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '...' : str;
  }

  // Listen for storage changes from background or content script
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.youtubeQueue) {
        queue = changes.youtubeQueue.newValue || [];
      }
      if (changes.currentIndex !== undefined) {
        currentIndex = changes.currentIndex.newValue;
      }
      if (changes.settings) {
        settings = changes.settings.newValue || settings;
        renderSettings();
      }
      renderQueue();
    }
  });

  // Initialize
  await loadState();
});
