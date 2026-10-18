// YouTube Queue - Content Script

(function () {
  'use strict';

  let currentVideoElement = null;
  let countdownTimer = null;
  let countdownSecondsRemaining = 0;
  let isTimerTriggered = false;
  let activeOverlay = null;

  // Track current page state
  let currentVideoId = null;
  let state = {
    queue: [],
    currentIndex: -1,
    settings: {
      autoplayEnabled: true,
      autoplayMode: 'video_end',
      endDelaySeconds: 5,
      timerDurationSeconds: 180,
      loopQueue: false,
      respectVideoLoop: true,
      loopCurrentVideo: false
    }
  };

  // SVG Icons
  const ICONS = {
    queue: `<svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zm-7-2l5-4-5-4v8z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    next: `<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
    prev: `<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
    repeatOne: `<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>`,
    minimize: `<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>`,
    expand: `<svg viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>`
  };

  // Utility to extract video ID from URL
  function extractId(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.slice(1).split(/[?#&/]/)[0];
      }
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.replace('/shorts/', '').split(/[?#&/]/)[0];
      }
    } catch (e) {}
    const match = url.match(/(?:watch\?.*v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : null;
  }

  // Check if current video is set to loop (via HTML5 video, YouTube player API, or extension setting)
  function isVideoLooped() {
    const video = document.querySelector('video');
    if (!video) return false;

    // 1. Check HTML5 standard video loop property / attribute
    if (video.loop || video.hasAttribute('loop')) {
      return true;
    }

    // 2. Check YouTube player API if available
    try {
      const player = document.querySelector('#movie_player');
      if (player) {
        if (typeof player.isLooping === 'function' && player.isLooping()) {
          return true;
        }
        if (typeof player.getOptions === 'function') {
          const loopOpt = player.getOptions('loop');
          if (loopOpt === true || loopOpt === 'true') {
            return true;
          }
        }
      }
    } catch (e) {}

    // 3. Check extension single-video loop setting
    if (state.settings && state.settings.loopCurrentVideo) {
      return true;
    }

    return false;
  }

  // Toast Notification System
  function showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('ytq-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ytq-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `ytq-toast ytq-toast-${type}`;
    const iconSvg = type === 'success' ? ICONS.check : ICONS.queue;
    toast.innerHTML = `<span style="display:flex;align-items:center;color:${type === 'success' ? '#10b981' : '#3b82f6'};">${iconSvg}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'ytqToastOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  // Sync state from background
  async function syncState() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
      if (res) {
        state.queue = res.queue || [];
        state.currentIndex = typeof res.currentIndex === 'number' ? res.currentIndex : -1;
        state.settings = res.settings || state.settings;
        updateFloatingHUD();
        updateWatchButtonState();
      }
    } catch (e) {
      // Worker sleeping or reloading
    }
  }

  // Find the next video in queue
  function getNextVideo() {
    const queue = state.queue;
    const curr = state.currentIndex;
    if (curr + 1 < queue.length) {
      return queue[curr + 1];
    }
    if (state.settings.loopQueue && queue.length > 0) {
      return queue[0];
    }
    return null;
  }

  // Show Autoplay Countdown Overlay over player
  function triggerAutoplayCountdown(reason = 'ended') {
    if (!state.settings.autoplayEnabled) return;

    // If video is looped and user hasn't explicitly disabled loop respect, do NOT advance!
    if (isVideoLooped() && state.settings.respectVideoLoop !== false) {
      console.log('[YoutubeQueue] Video is looped. Skipping autoplay advance.');
      showToast('Video is looped — repeating current video', 'info', 2500);
      return;
    }

    const nextVideo = getNextVideo();
    if (!nextVideo) {
      console.log('[YoutubeQueue] No next video in queue.');
      return;
    }

    // Determine countdown delay (seconds)
    let delay = parseInt(state.settings.endDelaySeconds, 10);
    if (isNaN(delay) || delay < 0) delay = 5;

    // If 0s delay, advance immediately
    if (delay === 0) {
      executePlayNext();
      return;
    }

    dismissOverlay();

    const playerContainer = document.querySelector('#movie_player') || document.querySelector('.html5-video-player') || document.body;
    const overlay = document.createElement('div');
    overlay.id = 'ytq-autoplay-overlay';

    const radius = 34;
    const circumference = 2 * Math.PI * radius;

    const reasonLabel = reason === 'timer' ? 'Playback Limit Reached' : 'Video Finished';

    overlay.innerHTML = `
      <div class="ytq-overlay-content">
        <div class="ytq-overlay-tag">${reasonLabel}</div>
        <h3 class="ytq-overlay-title">Up Next: ${escapeHTML(nextVideo.title)}</h3>
        <div class="ytq-countdown-circle-wrap">
          <svg class="ytq-countdown-svg">
            <circle class="ytq-countdown-bg" cx="40" cy="40" r="${radius}"></circle>
            <circle class="ytq-countdown-progress" cx="40" cy="40" r="${radius}" 
                    stroke-dasharray="${circumference}" 
                    stroke-dashoffset="0"></circle>
          </svg>
          <div class="ytq-countdown-number" id="ytq-count-num">${delay}</div>
        </div>
        <div class="ytq-overlay-actions">
          <button class="ytq-btn-play-now" id="ytq-btn-play-now">Play Now</button>
          <button class="ytq-btn-cancel" id="ytq-btn-cancel">Cancel</button>
        </div>
      </div>
    `;

    playerContainer.appendChild(overlay);
    activeOverlay = overlay;

    overlay.querySelector('#ytq-btn-play-now').addEventListener('click', () => {
      dismissOverlay();
      executePlayNext();
    });

    overlay.querySelector('#ytq-btn-cancel').addEventListener('click', () => {
      dismissOverlay();
      showToast('Autoplay cancelled', 'info');
    });

    countdownSecondsRemaining = delay;
    const progressCircle = overlay.querySelector('.ytq-countdown-progress');
    const numDisplay = overlay.querySelector('#ytq-count-num');

    countdownTimer = setInterval(() => {
      countdownSecondsRemaining--;
      if (numDisplay) numDisplay.textContent = countdownSecondsRemaining;

      if (progressCircle) {
        const offset = circumference * (1 - countdownSecondsRemaining / delay);
        progressCircle.style.strokeDashoffset = offset;
      }

      if (countdownSecondsRemaining <= 0) {
        dismissOverlay();
        executePlayNext();
      }
    }, 1000);
  }

  function dismissOverlay() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (activeOverlay && activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
  }

  function executePlayNext() {
    chrome.runtime.sendMessage({ action: 'PLAY_NEXT' }, (res) => {
      if (res && res.success) {
        syncState();
      }
    });
  }

  let lastTrackedTime = 0;

  // Setup video element listeners for ended & playback timer
  function attachVideoListeners() {
    const video = document.querySelector('video');
    if (!video || video === currentVideoElement) return;

    currentVideoElement = video;
    isTimerTriggered = false;
    lastTrackedTime = 0;

    // If extension has loopCurrentVideo enabled, apply to video element
    if (state.settings && state.settings.loopCurrentVideo) {
      video.loop = true;
    }

    // Handle video end
    video.addEventListener('ended', () => {
      console.log('[YoutubeQueue] Video ended event fired.');
      if (isVideoLooped() && state.settings.respectVideoLoop !== false) {
        console.log('[YoutubeQueue] Video is looped. Holding queue on current item.');
        showToast('Video is looped — repeating current video', 'info', 2000);
        return;
      }

      if (state.settings.autoplayMode === 'video_end') {
        triggerAutoplayCountdown('ended');
      }
    });

    // Handle "After specific time" mode
    video.addEventListener('timeupdate', () => {
      // Detect when video loops back to 0
      if (video.currentTime < lastTrackedTime - 2) {
        isTimerTriggered = false;
        console.log('[YoutubeQueue] Video looped back to beginning.');
      }
      lastTrackedTime = video.currentTime;

      if (
        state.settings.autoplayEnabled &&
        state.settings.autoplayMode === 'timer' &&
        !isTimerTriggered
      ) {
        // If video is looped, hold queue unless specified
        if (isVideoLooped() && state.settings.respectVideoLoop !== false) {
          return;
        }

        const targetSeconds = parseInt(state.settings.timerDurationSeconds, 10) || 180;
        if (video.currentTime >= targetSeconds) {
          isTimerTriggered = true;
          console.log(`[YoutubeQueue] Specific time limit (${targetSeconds}s) reached.`);
          triggerAutoplayCountdown('timer');
        }
      }
    });
  }

  // Inject "+ Queue" button on YouTube video cards/thumbnails
  function processVideoCards() {
    // Select YouTube video card containers
    const cardSelectors = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'yt-lockup-view-model'
    ];

    const cards = document.querySelectorAll(cardSelectors.join(','));
    cards.forEach(card => {
      if (card.dataset.ytqProcessed) return;

      const link = card.querySelector('a#thumbnail, a.ytd-thumbnail, a[href*="/watch?v="]');
      if (!link) return;

      const videoId = extractId(link.href);
      if (!videoId) return;

      card.dataset.ytqProcessed = 'true';

      // Create quick queue button
      const btn = document.createElement('button');
      btn.className = 'ytq-thumb-btn';
      btn.title = 'Add to YouTube Queue';
      btn.innerHTML = `${ICONS.plus}<span>Queue</span>`;

      // Position relative to thumbnail
      const thumb = card.querySelector('ytd-thumbnail, #thumbnail, .ytd-thumbnail');
      if (thumb) {
        thumb.style.position = 'relative';
        thumb.appendChild(btn);
      } else {
        card.style.position = 'relative';
        card.appendChild(btn);
      }

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const titleElem = card.querySelector('#video-title, #title, h3, .ytd-video-meta-block');
        const title = titleElem ? titleElem.textContent.trim() : `Video (${videoId})`;
        const channelElem = card.querySelector('#channel-name, .ytd-channel-name, #byline, .yt-core-attributed-string');
        const channel = channelElem ? channelElem.textContent.trim() : 'YouTube';
        const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

        btn.classList.add('ytq-added');
        btn.innerHTML = `${ICONS.check}<span>Added</span>`;

        const res = await chrome.runtime.sendMessage({
          action: 'ADD_TO_QUEUE',
          video: { id: videoId, title, channel, thumbnail }
        });

        if (res && res.alreadyInQueue) {
          showToast(`"${truncate(title, 35)}" already in queue!`, 'info');
        } else {
          showToast(`Added "${truncate(title, 35)}" to queue!`, 'success');
        }

        syncState();

        setTimeout(() => {
          btn.classList.remove('ytq-added');
          btn.innerHTML = `${ICONS.plus}<span>Queue</span>`;
        }, 2500);
      });
    });
  }

  // Inject Watch Page "+ Add to Queue" button
  function injectWatchPageButton() {
    if (!window.location.pathname.startsWith('/watch')) return;
    if (document.getElementById('ytq-watch-queue-btn')) return;

    // Look for YouTube action buttons under the player
    const actionsContainer = document.querySelector('#top-level-buttons-computed') ||
                             document.querySelector('#actions-inner') ||
                             document.querySelector('#owner');

    if (!actionsContainer) return;

    const btn = document.createElement('button');
    btn.id = 'ytq-watch-queue-btn';
    btn.className = 'ytq-watch-btn';
    btn.innerHTML = `${ICONS.queue}<span>Queue</span>`;

    btn.addEventListener('click', async () => {
      const vId = extractId(window.location.href);
      if (!vId) return;

      const titleElem = document.querySelector('h1.ytd-watch-metadata, #title h1');
      const title = titleElem ? titleElem.textContent.trim() : document.title.replace(' - YouTube', '');
      const channelElem = document.querySelector('#channel-name a, ytd-channel-name a');
      const channel = channelElem ? channelElem.textContent.trim() : 'YouTube';

      const res = await chrome.runtime.sendMessage({
        action: 'ADD_TO_QUEUE',
        video: { id: vId, title, channel, thumbnail: `https://img.youtube.com/vi/${vId}/mqdefault.jpg` }
      });

      if (res && res.alreadyInQueue) {
        showToast('This video is already in your queue!', 'info');
      } else {
        showToast('Added current video to queue!', 'success');
      }

      btn.classList.add('ytq-added');
      btn.innerHTML = `${ICONS.check}<span>Queued</span>`;
      syncState();
    });

    actionsContainer.appendChild(btn);
    updateWatchButtonState();
  }

  function updateWatchButtonState() {
    const btn = document.getElementById('ytq-watch-queue-btn');
    if (!btn) return;

    const vId = extractId(window.location.href);
    if (!vId) return;

    const isQueued = state.queue.some(item => item.id === vId);
    if (isQueued) {
      btn.classList.add('ytq-added');
      btn.innerHTML = `${ICONS.check}<span>Queued</span>`;
    } else {
      btn.classList.remove('ytq-added');
      btn.innerHTML = `${ICONS.queue}<span>Queue</span>`;
    }
  }

  // Floating HUD Controller on YouTube Page
  function createFloatingHUD() {
    if (document.getElementById('ytq-floating-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'ytq-floating-hud';
    hud.className = 'ytq-hud-minimized';

    hud.innerHTML = `
      <div class="ytq-hud-badge" id="ytq-hud-toggle" title="Click to expand/minimize YouTube Queue HUD">
        ${ICONS.queue}
        <span id="ytq-hud-count">0</span>
      </div>
      <div class="ytq-hud-expanded-view" style="display:flex;align-items:center;gap:10px;">
        <div class="ytq-hud-info">
          <div class="ytq-hud-now-playing" id="ytq-hud-title">Queue is empty</div>
          <div class="ytq-hud-next" id="ytq-hud-next-title"></div>
        </div>
        <button class="ytq-hud-btn" id="ytq-hud-loop" title="Loop Current Video (Pause queue advance)">${ICONS.repeatOne}</button>
        <button class="ytq-hud-btn" id="ytq-hud-prev" title="Previous Video">${ICONS.prev}</button>
        <button class="ytq-hud-btn" id="ytq-hud-play" title="Play / Pause">${ICONS.play}</button>
        <button class="ytq-hud-btn" id="ytq-hud-next" title="Next Video">${ICONS.next}</button>
      </div>
    `;

    document.body.appendChild(hud);

    // Toggle expand/collapse
    hud.querySelector('#ytq-hud-toggle').addEventListener('click', () => {
      hud.classList.toggle('ytq-hud-minimized');
    });

    hud.querySelector('#ytq-hud-loop').addEventListener('click', async () => {
      const video = document.querySelector('video');
      const nowLooped = !isVideoLooped();
      if (video) {
        video.loop = nowLooped;
      }
      state.settings.loopCurrentVideo = nowLooped;
      await chrome.runtime.sendMessage({
        action: 'UPDATE_SETTINGS',
        settings: { loopCurrentVideo: nowLooped }
      });
      updateFloatingHUD();
      showToast(
        nowLooped
          ? 'Loop active: Video will repeat without advancing'
          : 'Loop disabled: Queue will advance normally',
        'info'
      );
    });

    hud.querySelector('#ytq-hud-prev').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'PLAY_PREV' }, syncState);
    });

    hud.querySelector('#ytq-hud-next').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'PLAY_NEXT' }, syncState);
    });

    hud.querySelector('#ytq-hud-play').addEventListener('click', () => {
      const video = document.querySelector('video');
      if (video) {
        if (video.paused) video.play();
        else video.pause();
      }
    });

    updateFloatingHUD();
  }

  function updateFloatingHUD() {
    const hud = document.getElementById('ytq-floating-hud');
    if (!hud) return;

    const countElem = hud.querySelector('#ytq-hud-count');
    const titleElem = hud.querySelector('#ytq-hud-title');
    const nextElem = hud.querySelector('#ytq-hud-next-title');
    const loopBtn = hud.querySelector('#ytq-hud-loop');

    const total = state.queue.length;
    if (countElem) countElem.textContent = total;

    // Hide HUD if queue is empty
    if (total === 0) {
      hud.style.display = 'none';
      return;
    } else {
      hud.style.display = 'flex';
    }

    const currentItem = state.currentIndex >= 0 && state.currentIndex < total ? state.queue[state.currentIndex] : null;
    const nextItem = getNextVideo();
    const isLooped = isVideoLooped();

    if (loopBtn) {
      loopBtn.classList.toggle('active', isLooped);
      loopBtn.title = isLooped
        ? 'Video is Looped (Queue will NOT advance until specified). Click to unloop.'
        : 'Loop Current Video (Keep repeating without advancing queue)';
    }

    if (titleElem) {
      titleElem.textContent = currentItem ? currentItem.title : `${total} videos in queue`;
    }
    if (nextElem) {
      if (isLooped) {
        nextElem.textContent = '🔂 Looped — will repeat';
        nextElem.style.color = '#ff335c';
      } else {
        nextElem.textContent = nextItem ? `Next: ${nextItem.title}` : (total > 0 ? 'End of queue' : '');
        nextElem.style.color = '#9ca3af';
      }
    }
  }

  // Handle SPA YouTube navigation
  function handleNavigation() {
    const newId = extractId(window.location.href);
    if (newId !== currentVideoId) {
      currentVideoId = newId;
      isTimerTriggered = false;
      dismissOverlay();

      if (newId) {
        chrome.runtime.sendMessage({ action: 'REPORT_CURRENT_VIDEO', videoId: newId });
      }
    }

    setTimeout(() => {
      attachVideoListeners();
      injectWatchPageButton();
      processVideoCards();
      syncState();
    }, 800);
  }

  // Helper formatting
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

  // MutationObserver to catch dynamically loaded YouTube video cards
  const observer = new MutationObserver((mutations) => {
    let shouldProcessCards = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        shouldProcessCards = true;
        break;
      }
    }
    if (shouldProcessCards) {
      processVideoCards();
      injectWatchPageButton();
      attachVideoListeners();
    }
  });

  // Listen to messages from background / popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'STATE_CHANGED') {
      syncState();
      sendResponse({ acknowledged: true });
    } else if (request.action === 'SHOW_TOAST') {
      showToast(request.message, request.toastType || 'success');
      syncState();
      sendResponse({ acknowledged: true });
    } else if (request.action === 'SET_VIDEO_LOOP') {
      const video = document.querySelector('video');
      if (video) {
        video.loop = !!request.loop;
      }
      state.settings.loopCurrentVideo = !!request.loop;
      updateFloatingHUD();
      sendResponse({ success: true, looped: isVideoLooped() });
    } else if (request.action === 'QUERY_VIDEO_LOOP') {
      sendResponse({ looped: isVideoLooped() });
    }
    return true;
  });

  // Sync state when storage changes (e.g. from context menu, popup, or background)
  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.youtubeQueue || changes.currentIndex || changes.settings)) {
      syncState();
    }
  });

  // Initialize
  function init() {
    observer.observe(document.body, { childList: true, subtree: true });

    // YouTube SPA custom events
    window.addEventListener('yt-navigate-finish', handleNavigation);
    window.addEventListener('spfdone', handleNavigation);
    window.addEventListener('popstate', handleNavigation);

    handleNavigation();
    createFloatingHUD();
    syncState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
