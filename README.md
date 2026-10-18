# YouTube Queue & Autoplay (Google Chrome Extension)

A Chrome extension that lets you queue YouTube videos as you find them, reorder or manage your playlist locally, and automatically play the next video after a customizable duration or when the current video finishes.

---

## ✨ Features

- **📋 One-Click "Copy Current URL & Add to Queue"**:
  - Quickly copies the clean YouTube URL (`https://www.youtube.com/watch?v=...`) directly to your clipboard and appends the video to your queue with title, channel name, and thumbnail.
  - Also supports manual pasting of any YouTube URL, short (`/shorts/`), or shortened link (`youtu.be`).

- **🔍 In-Page Discovery & Quick Add ("Queue Videos Found")**:
  - Automatically adds a sleek **+ Queue** hover button on YouTube video cards across the Home feed, Search results, Channel pages, and Recommendations.
  - Adds a dedicated **Queue** button right in YouTube's watch page action bar.
  - Adds videos without needing to open them in new tabs!

- **⏱️ Smart Autoplay & Custom Timers**:
  - **Mode 1 (When Video Ends)**: Plays the next video when the current one finishes, with configurable countdown delays (`0s Instant`, `3s`, `5s`, `10s`, `15s`).
  - **Mode 2 (After Specific Time Limit)**: Advance to the next video after playing for a specific duration (`1m`, `2m`, `3m`, `5m`, `10m`) — ideal for music sessions, study intervals, or previewing long videos.
  - **🔂 Video Loop Protection**: If the current video is looped (via YouTube's native right-click Loop, the popup Repeat-1 button, or the in-page floating HUD), **the queue will NOT advance** to the next item until specified (such as clicking Next, picking another video, or toggling off loop).
  - **Interactive Countdown Overlay**: Shows an in-player countdown overlay with "Play Now" and "Cancel" buttons.
  - **Loop Entire Queue Support**: Option to loop back to the beginning when your queue finishes.

- **🔄 Reorder & Delete Queue Items**:
  - **Drag-and-Drop Reordering**: Smooth HTML5 drag handles to arrange your queue in any order with live insertion previews.
  - **Quick Move Arrows**: 1-click Up and Down buttons.
  - **Delete Items**: Remove individual videos or clear the entire queue with one click.
  - **Shuffle & Direct Play**: Shuffle remaining videos, or click any video to jump straight to it.

- **🎨 Modern Dark UI & Floating Mini-Player HUD**:
  - Sleek obsidian-themed popup interface with real-time "Now Playing" tracking.
  - Floating, minimizable HUD overlay directly on YouTube showing current status and Prev/Play/Next controls.

---

## 🚀 How to Install in Google Chrome

1. Open **Google Chrome**.
2. In the address bar, type:
   ```text
   chrome://extensions/
   ```
3. Toggle on **Developer mode** in the upper-right corner.
4. Click the **Load unpacked** button in the upper-left.
5. Select the project directory:
   ```text
   C:\Repos\YoutubeQueue
   ```
6. Click the puzzle icon (Extensions) in Chrome's toolbar and **pin** **YouTube Queue & Autoplay** for quick access.

---

## 📁 Project Structure

```text
YoutubeQueue/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── popup/
│   ├── popup.html        # Extension popup interface
│   ├── popup.css         # Modern dark theme styles & animations
│   └── popup.js          # Queue manager, drag-and-drop, & timer controls
├── background/
│   └── background.js     # Service worker managing tabs, queue state, & alarms
├── content/
│   ├── content.js        # Content script detecting video playback & in-page buttons
│   └── content.css       # In-page overlay, thumbnail buttons, & floating HUD styles
├── utils/
│   └── youtube.js        # Video ID extraction, oEmbed metadata, & formatting
└── icons/                # High-resolution extension icons (16px, 48px, 128px)
```
