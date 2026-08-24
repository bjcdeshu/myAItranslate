/**
 * myAItranslate - YouTube bilingual Document Picture-in-Picture
 *
 * This module deliberately does not fetch YouTube caption tracks. It consumes
 * the subtitle output already rendered by Immersive Translate, with an event
 * adapter reserved for a future direct renderer hook.
 */
(() => {
  'use strict';

  const INSTANCE_KEY = '__myAItranslateYoutubePipV1__';
  const BUTTON_ID = 'myait-youtube-pip-button';
  const TOAST_ID = 'myait-youtube-pip-toast';
  const RENDERER_EVENT = 'myAItranslate:subtitle-state';
  const PUBLIC_STATE_EVENT = 'myAItranslate:pip-subtitle-state';
  const CLEAR_DELAY_MS = 120;
  const DIRECT_EVENT_FRESH_MS = 1_200;

  const SOURCE_SELECTORS = [
    'source-cue',
    '.source-cue',
    '[class~="source-cue"]',
    '[class*="source-cue"]',
    '[data-immersive-translate-subtitle-type="source"]',
    '[data-immersive-translate-subtitle-type="original"]',
    '[data-subtitle-type="source"]',
    '.immersive-translate-video-subtitle-source',
    '.imt-caption-source',
  ];

  const TARGET_SELECTORS = [
    'target-cue',
    '.target-cue',
    '[class~="target-cue"]',
    '[class*="target-cue"]',
    '[data-immersive-translate-subtitle-type="target"]',
    '[data-immersive-translate-subtitle-type="translation"]',
    '[data-subtitle-type="target"]',
    '.immersive-translate-video-subtitle-target',
    '.imt-caption-translation',
  ];

  const YOUTUBE_CAPTION_SELECTORS = [
    '.ytp-caption-segment',
    '.captions-text .caption-visual-line',
  ];

  function cleanText(value) {
    if (value == null) return '';
    return String(value)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function uniqueTexts(values) {
    const seen = new Set();
    const result = [];
    for (const value of values || []) {
      const text = cleanText(value);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
    return result;
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeSubtitleState(input = {}) {
    const original = cleanText(
      input.original ?? input.source ?? input.text ?? input.sourceText,
    );
    let translated = cleanText(
      input.translated ?? input.translation ?? input.target ?? input.targetText,
    );

    if (translated === original) translated = '';

    const start = finiteNumber(input.start ?? input.startTime);
    const end = finiteNumber(input.end ?? input.endTime);

    return {
      original,
      translated,
      start,
      end: end != null && start != null && end > start ? end : null,
    };
  }

  function mergeSubtitleCandidates(sourceValues, targetValues, fallbackValues) {
    const source = uniqueTexts(sourceValues);
    const target = uniqueTexts(targetValues);
    const fallback = uniqueTexts(fallbackValues);

    const original = cleanText(source.join('\n') || fallback.join('\n'));
    let translated = cleanText(target.join('\n'));
    if (translated === original) translated = '';

    return normalizeSubtitleState({ original, translated });
  }

  function computePipDimensions(videoWidth, videoHeight, preferredWidth = 560) {
    const width = Math.min(720, Math.max(320, Math.round(Number(preferredWidth) || 560)));
    const rawWidth = Number(videoWidth);
    const rawHeight = Number(videoHeight);
    const ratio = rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 16 / 9;
    const safeRatio = Math.min(3, Math.max(0.6, ratio));
    const height = Math.min(720, Math.max(240, Math.round(width / safeRatio)));
    return { width, height };
  }

  function clampSeekTime(currentTime, delta, duration) {
    const current = finiteNumber(currentTime) ?? 0;
    const next = current + (finiteNumber(delta) ?? 0);
    if (Number.isFinite(duration) && duration >= 0) {
      return Math.min(duration, Math.max(0, next));
    }
    return Math.max(0, next);
  }

  const testApi = Object.freeze({
    cleanText,
    uniqueTexts,
    normalizeSubtitleState,
    mergeSubtitleCandidates,
    computePipDimensions,
    clampSeekTime,
  });

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    globalThis.__MYAIT_YOUTUBE_PIP_TEST__ = testApi;
    return;
  }

  if (window.top !== window) return;

  const previous = window[INSTANCE_KEY];
  if (previous && typeof previous.refresh === 'function') {
    previous.refresh();
    return;
  }

  const language = navigator.language?.toLowerCase() || 'en';
  const zh = language.startsWith('zh');
  const messages = zh
    ? {
        title: '双语画中画',
        unsupported: '当前浏览器不支持双语画中画，需要 Chrome 116 或更高版本',
        noVideo: '没有找到可播放的视频',
        openFailed: '画中画打开失败',
        close: '关闭画中画',
        play: '播放',
        pause: '暂停',
        rewind: '后退 10 秒',
        forward: '前进 10 秒',
        mute: '静音',
        unmute: '取消静音',
      }
    : {
        title: 'Bilingual Picture-in-Picture',
        unsupported: 'Bilingual Picture-in-Picture requires Chrome 116 or newer',
        noVideo: 'No playable video was found',
        openFailed: 'Could not open Picture-in-Picture',
        close: 'Close Picture-in-Picture',
        play: 'Play',
        pause: 'Pause',
        rewind: 'Back 10 seconds',
        forward: 'Forward 10 seconds',
        mute: 'Mute',
        unmute: 'Unmute',
      };

  const controller = createController();
  Object.defineProperty(window, INSTANCE_KEY, {
    configurable: true,
    enumerable: false,
    value: controller,
  });
  controller.start();

  function createController() {
    const state = {
      pipWindow: null,
      pipDocument: null,
      sourceVideo: null,
      mirrorVideo: null,
      captureStream: null,
      videoMode: null,
      restoreVideo: null,
      subtitle: normalizeSubtitleState(),
      subtitleSource: 'none',
      directEventAt: 0,
      clearTimer: null,
      scanScheduled: false,
      rootObservers: new Map(),
      searchRoots: new Set(),
      cleanupCallbacks: [],
      destroyed: false,
    };

    function start() {
      registerSearchRoot(document);
      discoverShadowRoots(document.documentElement);

      window.addEventListener(RENDERER_EVENT, handleRendererSubtitleEvent);
      window.addEventListener('yt-navigate-finish', handleNavigation);
      window.addEventListener('yt-page-data-updated', scheduleScan);
      window.addEventListener('popstate', handleNavigation);
      window.addEventListener('beforeunload', destroy, { once: true });

      scheduleScan();
    }

    function refresh() {
      discoverShadowRoots(document.documentElement);
      scheduleScan();
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      closePip();
      clearTimeout(state.clearTimer);
      state.rootObservers.forEach((observer) => observer.disconnect());
      state.rootObservers.clear();
      state.searchRoots.clear();
      window.removeEventListener(RENDERER_EVENT, handleRendererSubtitleEvent);
      window.removeEventListener('yt-navigate-finish', handleNavigation);
      window.removeEventListener('yt-page-data-updated', scheduleScan);
      window.removeEventListener('popstate', handleNavigation);
      delete window[INSTANCE_KEY];
    }

    function registerSearchRoot(root) {
      if (!root || state.searchRoots.has(root)) return;
      state.searchRoots.add(root);
      try {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes || []) {
              if (node?.nodeType === Node.ELEMENT_NODE) discoverShadowRoots(node);
            }
          }
          scheduleScan();
        });
        observer.observe(root, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        state.rootObservers.set(root, observer);
      } catch {
        // A detached or browser-owned root can reject observation. Ignore it.
      }
    }

    function discoverShadowRoots(startNode) {
      if (!startNode) return;
      const stack = [];
      if (startNode.nodeType === Node.ELEMENT_NODE) stack.push(startNode);
      else if (startNode.documentElement) stack.push(startNode.documentElement);

      while (stack.length) {
        const element = stack.pop();
        if (!element || element.nodeType !== Node.ELEMENT_NODE) continue;
        if (element.shadowRoot) registerSearchRoot(element.shadowRoot);
        for (const child of element.children || []) stack.push(child);
      }
    }

    function scheduleScan() {
      if (state.destroyed || state.scanScheduled) return;
      state.scanScheduled = true;
      requestAnimationFrame(() => {
        state.scanScheduled = false;
        scanPage();
      });
    }

    function scanPage() {
      ensureButton();

      if (state.pipWindow && state.sourceVideo) {
        const currentVideo = findSourceVideo();
        if (currentVideo && currentVideo !== state.sourceVideo && state.videoMode !== 'moved') {
          closePip();
        }
      }

      if (Date.now() - state.directEventAt <= DIRECT_EVENT_FRESH_MS) return;

      const sourceTexts = collectVisibleTexts(SOURCE_SELECTORS);
      const targetTexts = collectVisibleTexts(TARGET_SELECTORS);
      const fallbackTexts = collectVisibleTexts(YOUTUBE_CAPTION_SELECTORS);
      const subtitle = mergeSubtitleCandidates(sourceTexts, targetTexts, fallbackTexts);

      if (subtitle.original || subtitle.translated) {
        clearTimeout(state.clearTimer);
        state.clearTimer = null;
        setSubtitle(subtitle, sourceTexts.length || targetTexts.length ? 'immersive-dom' : 'youtube-dom');
      } else if (!state.clearTimer) {
        state.clearTimer = setTimeout(() => {
          state.clearTimer = null;
          setSubtitle(normalizeSubtitleState(), 'none');
        }, CLEAR_DELAY_MS);
      }
    }

    function queryAcrossRoots(selector) {
      const nodes = [];
      const seen = new Set();
      for (const root of state.searchRoots) {
        try {
          for (const node of root.querySelectorAll(selector)) {
            if (seen.has(node)) continue;
            seen.add(node);
            nodes.push(node);
          }
        } catch {
          // Invalid selectors or a stale root should not break subtitle updates.
        }
      }
      return nodes;
    }

    function collectVisibleTexts(selectors) {
      const elements = [];
      const seen = new Set();
      for (const selector of selectors) {
        for (const element of queryAcrossRoots(selector)) {
          if (seen.has(element) || !isVisibleElement(element)) continue;
          seen.add(element);
          elements.push(element);
        }
      }

      elements.sort((left, right) => {
        if (left === right) return 0;
        const position = left.compareDocumentPosition?.(right) || 0;
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      return uniqueTexts(elements.map((element) => element.textContent));
    }

    function isVisibleElement(element) {
      if (!element?.isConnected) return false;
      if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
      try {
        const style = getComputedStyle(element);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number.parseFloat(style.opacity || '1') === 0
        ) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      } catch {
        return false;
      }
    }

    function handleRendererSubtitleEvent(event) {
      const subtitle = normalizeSubtitleState(event?.detail || {});
      state.directEventAt = Date.now();
      clearTimeout(state.clearTimer);
      state.clearTimer = null;
      setSubtitle(subtitle, 'renderer-event');
    }

    function setSubtitle(next, source) {
      const subtitle = normalizeSubtitleState(next);
      if (
        subtitle.original === state.subtitle.original &&
        subtitle.translated === state.subtitle.translated &&
        subtitle.start === state.subtitle.start &&
        subtitle.end === state.subtitle.end
      ) {
        return;
      }

      state.subtitle = subtitle;
      state.subtitleSource = source;
      renderSubtitle();

      try {
        window.dispatchEvent(
          new CustomEvent(PUBLIC_STATE_EVENT, {
            detail: { ...subtitle, source },
          }),
        );
      } catch {
        // Public diagnostics are optional.
      }
    }

    function ensureButton() {
      if (!isYoutubePlaybackPage()) return;
      const existing = document.getElementById(BUTTON_ID);
      if (existing) {
        updateButtonState(existing);
        return;
      }

      const controls = document.querySelector('.ytp-right-controls');
      if (!controls) return;

      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.className = 'ytp-button';
      button.type = 'button';
      button.title = messages.title;
      button.setAttribute('aria-label', messages.title);
      button.setAttribute('aria-pressed', 'false');
      button.style.width = '48px';
      button.style.padding = '0 8px';
      button.appendChild(createButtonIcon(false));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePip();
      });

      const nativePip = controls.querySelector('.ytp-pip-button');
      const fullscreen = controls.querySelector('.ytp-fullscreen-button');
      controls.insertBefore(button, nativePip || fullscreen || null);
      updateButtonState(button);
    }

    function createButtonIcon(active) {
      const namespace = 'http://www.w3.org/2000/svg';
      const accent = active ? '#ff6b9a' : '#ffffff';
      const svg = document.createElementNS(namespace, 'svg');
      for (const [name, value] of Object.entries({
        viewBox: '0 0 36 36',
        width: '100%',
        height: '100%',
        'aria-hidden': 'true',
        focusable: 'false',
      })) {
        svg.setAttribute(name, value);
      }

      const frame = document.createElementNS(namespace, 'rect');
      for (const [name, value] of Object.entries({
        x: '4', y: '7', width: '28', height: '21', rx: '2.5',
        fill: 'none', stroke: accent, 'stroke-width': '2',
      })) frame.setAttribute(name, value);

      const inset = document.createElementNS(namespace, 'rect');
      for (const [name, value] of Object.entries({
        x: '19', y: '17', width: '11', height: '8', rx: '1.5', fill: accent,
      })) inset.setAttribute(name, value);

      const lines = document.createElementNS(namespace, 'path');
      for (const [name, value] of Object.entries({
        d: 'M8.5 13.5h8M8.5 18h7', stroke: accent,
        'stroke-width': '1.8', 'stroke-linecap': 'round',
      })) lines.setAttribute(name, value);

      svg.append(frame, inset, lines);
      return svg;
    }

    function updateButtonState(button = document.getElementById(BUTTON_ID)) {
      if (!button) return;
      const active = Boolean(state.pipWindow && !state.pipWindow.closed);
      const marker = active ? 'true' : 'false';
      if (button.dataset.pipActive === marker) return;
      button.dataset.pipActive = marker;
      button.setAttribute('aria-pressed', marker);
      button.title = active ? messages.close : messages.title;
      button.replaceChildren(createButtonIcon(active));
    }

    function isYoutubePlaybackPage() {
      return location.pathname === '/watch' || location.pathname.startsWith('/live/');
    }

    function handleNavigation() {
      if (state.pipWindow) closePip();
      setSubtitle(normalizeSubtitleState(), 'none');
      setTimeout(scheduleScan, 0);
      setTimeout(scheduleScan, 500);
    }

    async function togglePip() {
      if (state.pipWindow && !state.pipWindow.closed) {
        closePip();
        return;
      }
      await openPip();
    }

    async function openPip() {
      const pictureInPicture = window.documentPictureInPicture;
      if (!pictureInPicture?.requestWindow) {
        showToast(messages.unsupported);
        return;
      }

      const sourceVideo = findSourceVideo();
      if (!sourceVideo) {
        showToast(messages.noVideo);
        return;
      }

      const dimensions = computePipDimensions(
        sourceVideo.videoWidth || sourceVideo.clientWidth,
        sourceVideo.videoHeight || sourceVideo.clientHeight,
      );

      try {
        let pipWindow;
        try {
          pipWindow = await pictureInPicture.requestWindow({
            ...dimensions,
            preferInitialWindowPlacement: true,
          });
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          pipWindow = await pictureInPicture.requestWindow(dimensions);
        }

        state.pipWindow = pipWindow;
        state.pipDocument = pipWindow.document;
        state.sourceVideo = sourceVideo;
        setupPipDocument(pipWindow, sourceVideo);
        updateButtonState();
      } catch (error) {
        console.error('[myAItranslate][YouTube PiP]', error);
        showToast(`${messages.openFailed}: ${error?.message || String(error)}`);
        cleanupPipState();
      }
    }

    function findSourceVideo() {
      if (state.videoMode === 'moved' && state.sourceVideo) return state.sourceVideo;

      const preferred = document.querySelector('video.html5-main-video');
      if (preferred && preferred.readyState > 0) return preferred;

      const candidates = [...document.querySelectorAll('video')]
        .filter((video) => video.readyState > 0 && video.isConnected)
        .sort((left, right) => {
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return b.width * b.height - a.width * a.height;
        });
      return candidates[0] || null;
    }

    function setupPipDocument(pipWindow, sourceVideo) {
      const doc = pipWindow.document;
      doc.title = messages.title;
      doc.documentElement.lang = zh ? 'zh-CN' : 'en';
      doc.head.replaceChildren();
      doc.body.replaceChildren();

      const meta = doc.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width,initial-scale=1';
      doc.head.appendChild(meta);

      const style = doc.createElement('style');
      style.textContent = buildPipStyles();
      doc.head.appendChild(style);

      const root = doc.createElement('main');
      root.id = 'myait-pip-root';
      doc.body.appendChild(root);

      attachVideo(root, sourceVideo, doc);

      const subtitleContainer = doc.createElement('div');
      subtitleContainer.id = 'myait-pip-subtitles';
      subtitleContainer.setAttribute('aria-live', 'off');

      const original = doc.createElement('div');
      original.id = 'myait-pip-original';
      original.className = 'myait-pip-line myait-pip-original';

      const translated = doc.createElement('div');
      translated.id = 'myait-pip-translated';
      translated.className = 'myait-pip-line myait-pip-translated';

      subtitleContainer.append(original, translated);
      root.appendChild(subtitleContainer);

      const controls = buildPipControls(doc, sourceVideo);
      root.appendChild(controls);

      const onPageHide = () => cleanupPipState();
      const onKeyDown = (event) => handlePipKeyboard(event, sourceVideo);
      pipWindow.addEventListener('pagehide', onPageHide, { once: true });
      pipWindow.addEventListener('keydown', onKeyDown);
      state.cleanupCallbacks.push(() => pipWindow.removeEventListener('keydown', onKeyDown));

      renderSubtitle();
      updateControlState();
    }

    function attachVideo(root, sourceVideo, doc) {
      const capture = sourceVideo.captureStream || sourceVideo.mozCaptureStream;
      if (typeof capture === 'function') {
        try {
          const stream = capture.call(sourceVideo);
          if (stream?.getVideoTracks?.().length) {
            const mirror = doc.createElement('video');
            mirror.id = 'myait-pip-video';
            mirror.autoplay = true;
            mirror.muted = true;
            mirror.playsInline = true;
            mirror.disablePictureInPicture = true;
            mirror.srcObject = stream;
            root.appendChild(mirror);
            mirror.play().catch(() => {});

            state.videoMode = 'stream';
            state.captureStream = stream;
            state.mirrorVideo = mirror;

            const track = stream.getVideoTracks()[0];
            const onTrackEnded = () => {
              if (state.pipWindow && !state.pipWindow.closed) closePip();
            };
            track?.addEventListener('ended', onTrackEnded, { once: true });
            state.cleanupCallbacks.push(() => track?.removeEventListener('ended', onTrackEnded));
            return;
          }
        } catch (error) {
          console.warn('[myAItranslate][YouTube PiP] captureStream unavailable', error);
        }
      }

      const parent = sourceVideo.parentNode;
      if (!parent) throw new Error('Video element has no parent');

      const placeholder = document.createComment('myAItranslate-youtube-pip-video');
      parent.insertBefore(placeholder, sourceVideo);
      const styleAttribute = sourceVideo.getAttribute('style');
      sourceVideo.style.width = '100%';
      sourceVideo.style.height = '100%';
      sourceVideo.style.objectFit = 'contain';
      sourceVideo.style.background = '#000';
      root.appendChild(sourceVideo);

      state.videoMode = 'moved';
      state.restoreVideo = () => {
        if (placeholder.parentNode) placeholder.replaceWith(sourceVideo);
        else if (parent.isConnected) parent.appendChild(sourceVideo);
        if (styleAttribute == null) sourceVideo.removeAttribute('style');
        else sourceVideo.setAttribute('style', styleAttribute);
      };
    }

    function buildPipControls(doc, sourceVideo) {
      const controls = doc.createElement('nav');
      controls.id = 'myait-pip-controls';
      controls.setAttribute('aria-label', messages.title);

      const rewind = createControlButton(doc, '↶ 10', messages.rewind, () => {
        sourceVideo.currentTime = clampSeekTime(sourceVideo.currentTime, -10, sourceVideo.duration);
      });
      rewind.dataset.action = 'rewind';

      const play = createControlButton(doc, '▶', messages.play, () => {
        if (sourceVideo.paused) sourceVideo.play().catch(() => {});
        else sourceVideo.pause();
      });
      play.dataset.action = 'play';

      const forward = createControlButton(doc, '10 ↷', messages.forward, () => {
        sourceVideo.currentTime = clampSeekTime(sourceVideo.currentTime, 10, sourceVideo.duration);
      });
      forward.dataset.action = 'forward';

      const mute = createControlButton(doc, '🔊', messages.mute, () => {
        sourceVideo.muted = !sourceVideo.muted;
      });
      mute.dataset.action = 'mute';

      const close = createControlButton(doc, '×', messages.close, closePip);
      close.dataset.action = 'close';

      controls.append(rewind, play, forward, mute, close);

      const update = () => updateControlState();
      for (const eventName of ['play', 'pause', 'ended', 'volumechange', 'durationchange']) {
        sourceVideo.addEventListener(eventName, update);
        state.cleanupCallbacks.push(() => sourceVideo.removeEventListener(eventName, update));
      }

      return controls;
    }

    function createControlButton(doc, label, title, action) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      return button;
    }

    function updateControlState() {
      const doc = state.pipDocument;
      const video = state.sourceVideo;
      if (!doc || !video) return;

      const play = doc.querySelector('[data-action="play"]');
      if (play) {
        play.textContent = video.paused ? '▶' : '❚❚';
        play.title = video.paused ? messages.play : messages.pause;
        play.setAttribute('aria-label', play.title);
      }

      const mute = doc.querySelector('[data-action="mute"]');
      if (mute) {
        mute.textContent = video.muted || video.volume === 0 ? '🔇' : '🔊';
        mute.title = video.muted ? messages.unmute : messages.mute;
        mute.setAttribute('aria-label', mute.title);
      }

      const seekable = Number.isFinite(video.duration) && video.duration > 0;
      for (const action of ['rewind', 'forward']) {
        const button = doc.querySelector(`[data-action="${action}"]`);
        if (button) button.disabled = !seekable;
      }
    }

    function handlePipKeyboard(event, video) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const activeTag = state.pipDocument?.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k':
          event.preventDefault();
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          break;
        case 'arrowleft':
          event.preventDefault();
          video.currentTime = clampSeekTime(video.currentTime, -5, video.duration);
          break;
        case 'arrowright':
          event.preventDefault();
          video.currentTime = clampSeekTime(video.currentTime, 5, video.duration);
          break;
        case 'm':
          event.preventDefault();
          video.muted = !video.muted;
          break;
        case 'escape':
          event.preventDefault();
          closePip();
          break;
        default:
          break;
      }
    }

    function renderSubtitle() {
      const doc = state.pipDocument;
      if (!doc) return;
      const original = doc.getElementById('myait-pip-original');
      const translated = doc.getElementById('myait-pip-translated');
      if (!original || !translated) return;

      original.textContent = state.subtitle.original;
      translated.textContent = state.subtitle.translated;
      original.hidden = !state.subtitle.original;
      translated.hidden = !state.subtitle.translated;

      const container = doc.getElementById('myait-pip-subtitles');
      if (container) container.hidden = !state.subtitle.original && !state.subtitle.translated;
    }

    function closePip() {
      const pipWindow = state.pipWindow;
      if (pipWindow && !pipWindow.closed) {
        try {
          pipWindow.close();
        } catch {
          cleanupPipState();
        }
      } else {
        cleanupPipState();
      }
    }

    function cleanupPipState() {
      for (const cleanup of state.cleanupCallbacks.splice(0)) {
        try {
          cleanup();
        } catch {
          // Cleanup is best-effort and must remain idempotent.
        }
      }

      if (state.videoMode === 'moved' && state.restoreVideo) {
        try {
          state.restoreVideo();
        } catch (error) {
          console.error('[myAItranslate][YouTube PiP] failed to restore video', error);
        }
      }

      if (state.mirrorVideo) {
        try {
          state.mirrorVideo.srcObject = null;
        } catch {
          // Ignore a detached mirror document.
        }
      }

      if (state.captureStream) {
        for (const track of state.captureStream.getTracks?.() || []) {
          try {
            track.stop();
          } catch {
            // Ignore already-ended tracks.
          }
        }
      }

      state.pipWindow = null;
      state.pipDocument = null;
      state.sourceVideo = null;
      state.mirrorVideo = null;
      state.captureStream = null;
      state.videoMode = null;
      state.restoreVideo = null;
      updateButtonState();
    }

    function showToast(text) {
      document.getElementById(TOAST_ID)?.remove();
      const toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.textContent = text;
      toast.style.cssText = [
        'position:fixed',
        'top:20px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:2147483647',
        'max-width:min(520px,90vw)',
        'padding:10px 14px',
        'border-radius:8px',
        'background:rgba(20,20,20,.94)',
        'color:#fff',
        'font:14px/1.45 system-ui,sans-serif',
        'box-shadow:0 8px 28px rgba(0,0,0,.35)',
        'pointer-events:none',
      ].join(';');
      document.documentElement.appendChild(toast);
      setTimeout(() => toast.remove(), 3_500);
    }

    return { start, refresh, destroy, closePip, testApi };
  }

  function buildPipStyles() {
    return `
      *,*::before,*::after{box-sizing:border-box}
      html,body{width:100%;height:100%;margin:0;background:#000;overflow:hidden}
      body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff}
      #myait-pip-root{position:relative;width:100%;height:100%;background:#000;overflow:hidden}
      #myait-pip-root>video{display:block;width:100%;height:100%;object-fit:contain;background:#000}
      #myait-pip-subtitles{position:absolute;left:4%;right:4%;bottom:7%;z-index:20;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;text-align:center}
      #myait-pip-subtitles[hidden],.myait-pip-line[hidden]{display:none}
      .myait-pip-line{max-width:100%;padding:.22em .62em .28em;border-radius:.28em;background:rgba(0,0,0,.76);color:#fff;white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:0 1px 2px rgba(0,0,0,.9);box-decoration-break:clone;-webkit-box-decoration-break:clone}
      .myait-pip-original{font-size:clamp(13px,2.6vw,25px);font-weight:500;line-height:1.38}
      .myait-pip-translated{font-size:clamp(14px,2.9vw,28px);font-weight:650;line-height:1.42}
      #myait-pip-controls{position:absolute;top:8px;left:50%;z-index:30;display:flex;gap:6px;align-items:center;transform:translateX(-50%);padding:6px;border-radius:999px;background:rgba(15,15,15,.78);backdrop-filter:blur(8px);opacity:0;transition:opacity .16s ease}
      body:hover #myait-pip-controls,#myait-pip-controls:focus-within{opacity:1}
      #myait-pip-controls button{min-width:38px;height:32px;padding:0 9px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:600 13px/1 system-ui,sans-serif;cursor:pointer}
      #myait-pip-controls button:hover{background:rgba(255,255,255,.24)}
      #myait-pip-controls button:focus-visible{outline:2px solid #ff6b9a;outline-offset:2px}
      #myait-pip-controls button:disabled{opacity:.38;cursor:not-allowed}
      #myait-pip-controls [data-action="close"]{font-size:22px;line-height:1}
      @media (max-height:300px){#myait-pip-subtitles{bottom:4%}.myait-pip-original{font-size:clamp(12px,2.5vw,20px)}.myait-pip-translated{font-size:clamp(13px,2.8vw,22px)}}
    `;
  }
})();
