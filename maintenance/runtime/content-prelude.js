(() => {
  "use strict";

  const root = globalThis;
  const INSTALL_MARK = "__myAITranslateContentPreludeInstalled";
  if (root[INSTALL_MARK]) return;
  root[INSTALL_MARK] = true;

  const nativeJsonParse = JSON.parse.bind(JSON);

  const finiteNumber = (value, fallback = null) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function cleanTimedText(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, "")
      .replace(/\u200B/g, "")
      .replace(/\r/g, "")
      .replace(/[\t\f\v ]+/g, " ")
      .replace(/ *\n+ */g, "\n")
      .trim();
  }

  function eventText(event) {
    if (!event || !Array.isArray(event.segs)) return "";
    return cleanTimedText(event.segs.map((segment) => segment?.utf8 || "").join(""));
  }

  function containsCjk(value) {
    return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(value || "");
  }

  function mergeText(previous, incoming) {
    const left = cleanTimedText(previous);
    const right = cleanTimedText(incoming);
    if (!left) return right;
    if (!right || left === right) return left;
    if (right.startsWith(left)) return right;
    if (left.startsWith(right) || left.endsWith(right)) return left;

    const needsSpace =
      !containsCjk(left.slice(-1) + right.slice(0, 1)) &&
      !/[\s\n]$/.test(left) &&
      !/^[\s\n,.;:!?%)\]}]/.test(right);

    return cleanTimedText(`${left}${needsSpace ? " " : ""}${right}`);
  }

  function estimatedDuration(text) {
    const cjk = containsCjk(text);
    const units = cjk
      ? Array.from(text).length
      : text.split(/\s+/).filter(Boolean).length;
    return clamp(700 + units * (cjk ? 120 : 260), 1000, 8000);
  }

  function looksLikeTimedTextPayload(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        Array.isArray(value.events) &&
        value.events.some(
          (event) =>
            event &&
            typeof event === "object" &&
            ("tStartMs" in event || "dDurationMs" in event) &&
            Array.isArray(event.segs)
        )
    );
  }

  function hasAbnormalTimeline(events) {
    let previousStart = -Infinity;
    let previousKey = "";

    for (const event of events) {
      if (!event || !Array.isArray(event.segs)) continue;
      const text = eventText(event);
      if (!text && event.aAppend !== 1) continue;

      const start = finiteNumber(event.tStartMs);
      const duration = finiteNumber(event.dDurationMs);
      if (
        start === null ||
        start < 0 ||
        start < previousStart ||
        duration === null ||
        duration <= 0 ||
        duration > 60000 ||
        event.aAppend === 1
      ) {
        return true;
      }

      const key = `${start}|${duration}|${text}`;
      if (text && key === previousKey) return true;
      previousStart = start;
      previousKey = key;
    }

    return false;
  }

  function normalizeYoutubeEvents(rawEvents) {
    const ordered = (Array.isArray(rawEvents) ? rawEvents : [])
      .map((event, index) => ({ event: event || {}, index }))
      .filter(({ event }) => finiteNumber(event.tStartMs) !== null)
      .sort((left, right) => {
        const startDiff = Number(left.event.tStartMs) - Number(right.event.tStartMs);
        return startDiff || left.index - right.index;
      });

    const cues = [];

    const pushCue = (event, text, start, end, kind) => {
      if (!text || start < 0 || !Number.isFinite(start)) return;
      const previous = cues[cues.length - 1];

      if (previous && Math.abs(previous.start - start) <= 1) {
        previous.text = mergeText(previous.text, text);
        previous.end = Math.max(previous.end || start, end || start);
        return;
      }

      if (
        previous &&
        previous.text === text &&
        start <= (previous.end || previous.start + 2000) + 750
      ) {
        previous.end = Math.max(previous.end || start, end || start);
        return;
      }

      if (
        previous &&
        kind === "append" &&
        start <= (previous.end || previous.start + 2000) + 2000
      ) {
        previous.text = mergeText(previous.text, text);
        previous.end = Math.max(previous.end || start, end || start);
        return;
      }

      if (
        previous &&
        (text.startsWith(previous.text) || previous.text.startsWith(text)) &&
        start <= (previous.end || previous.start + 2500) + 1200
      ) {
        previous.text = text.length >= previous.text.length ? text : previous.text;
        previous.end = Math.max(previous.end || start, end || start);
        return;
      }

      cues.push({
        start,
        end,
        text,
        source: event,
      });
    };

    for (const { event } of ordered) {
      const start = Math.max(0, finiteNumber(event.tStartMs, 0));
      const duration = Math.max(0, finiteNumber(event.dDurationMs, 0));
      const end = duration > 0 ? start + duration : null;
      const text = eventText(event);
      const isAppend = event.aAppend === 1;
      const isSeparator = isAppend && (!text || text === "\n");

      if (isSeparator) continue;
      if (!text) continue;

      pushCue(event, text, start, end, isAppend ? "append" : "normal");
    }

    const deduplicated = [];
    for (const cue of cues) {
      const previous = deduplicated[deduplicated.length - 1];
      if (
        previous &&
        previous.text === cue.text &&
        cue.start <= (previous.end || previous.start + 2000) + 500
      ) {
        previous.end = Math.max(previous.end || previous.start, cue.end || cue.start);
      } else {
        deduplicated.push({ ...cue });
      }
    }

    for (let index = 0; index < deduplicated.length; index += 1) {
      const cue = deduplicated[index];
      const nextStart = deduplicated[index + 1]?.start;
      const fallbackEnd = cue.start + estimatedDuration(cue.text);
      let end = Number.isFinite(cue.end) && cue.end > cue.start ? cue.end : null;

      if (end === null) {
        end = Number.isFinite(nextStart) && nextStart > cue.start ? nextStart : fallbackEnd;
      }

      end = Math.min(end, cue.start + 15000);
      if (Number.isFinite(nextStart) && nextStart > cue.start && end > nextStart) {
        end = nextStart;
      }
      if (!(end > cue.start)) {
        end = cue.start + 250;
      }

      cue.end = end;
    }

    return deduplicated
      .filter((cue) => cue.text && cue.end > cue.start)
      .map((cue) => ({
        ...cue.source,
        tStartMs: Math.round(cue.start),
        dDurationMs: Math.max(1, Math.round(cue.end - cue.start)),
        aAppend: 0,
        segs: [{ utf8: cue.text }],
      }));
  }

  function normalizeYoutubeTimedTextPayload(payload) {
    if (!looksLikeTimedTextPayload(payload)) return payload;
    if (!hasAbnormalTimeline(payload.events)) return payload;

    const events = normalizeYoutubeEvents(payload.events);
    return events.length > 0 ? { ...payload, events } : payload;
  }

  function maybeNormalizeDeep(value, depth = 0) {
    if (depth > 4 || value === null || value === undefined) return value;

    if (looksLikeTimedTextPayload(value)) {
      return normalizeYoutubeTimedTextPayload(value);
    }

    if (typeof value === "string") {
      if (
        !value.includes('"events"') ||
        !value.includes('"tStartMs"') ||
        !value.includes('"segs"')
      ) {
        return value;
      }
      try {
        const parsed = nativeJsonParse(value);
        const normalized = maybeNormalizeDeep(parsed, depth + 1);
        return normalized === parsed ? value : JSON.stringify(normalized);
      } catch {
        return value;
      }
    }

    if (typeof value !== "object") return value;

    const candidateKeys = [
      "data",
      "detail",
      "payload",
      "response",
      "responseText",
      "body",
      "result",
    ];
    let copy = value;

    for (const key of candidateKeys) {
      if (!(key in value)) continue;
      const normalized = maybeNormalizeDeep(value[key], depth + 1);
      if (normalized !== value[key]) {
        if (copy === value) copy = Array.isArray(value) ? value.slice() : { ...value };
        copy[key] = normalized;
      }
    }

    return copy;
  }

  root.__myAITranslateNormalizeYoutubeTimedText = normalizeYoutubeTimedTextPayload;
  root.__myAITranslateNormalizeYoutubeEvents = normalizeYoutubeEvents;

  JSON.parse = function myAITranslateJsonParse(text, reviver) {
    const parsed = nativeJsonParse(text, reviver);
    if (
      typeof text === "string" &&
      text.includes('"events"') &&
      text.includes('"tStartMs"') &&
      text.includes('"segs"')
    ) {
      return maybeNormalizeDeep(parsed);
    }
    return parsed;
  };

  function installEventDetailBridge(target) {
    if (!target || typeof target.addEventListener !== "function") return;

    const nativeAdd = target.addEventListener.bind(target);
    const nativeRemove = target.removeEventListener.bind(target);
    const listenerRegistry = new WeakMap();

    const keyFor = (type, options) => {
      const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
      return `${type}|${capture ? 1 : 0}`;
    };

    target.addEventListener = function addEventListenerWithTimedTextGuard(
      type,
      listener,
      options
    ) {
      if (!listener) return nativeAdd(type, listener, options);

      const key = keyFor(type, options);
      let wrappers = listenerRegistry.get(listener);
      if (!wrappers) {
        wrappers = new Map();
        listenerRegistry.set(listener, wrappers);
      }

      let wrapped = wrappers.get(key);
      if (!wrapped) {
        wrapped = function timedTextAwareListener(event) {
          const detail = event && "detail" in event ? event.detail : undefined;
          const normalizedDetail = maybeNormalizeDeep(detail);
          let deliveredEvent = event;

          if (normalizedDetail !== detail && event) {
            deliveredEvent = new Proxy(event, {
              get(targetEvent, property) {
                if (property === "detail") return normalizedDetail;
                const value = Reflect.get(targetEvent, property, targetEvent);
                return typeof value === "function" ? value.bind(targetEvent) : value;
              },
            });
          }

          if (typeof listener === "function") {
            return listener.call(this, deliveredEvent);
          }
          if (typeof listener.handleEvent === "function") {
            return listener.handleEvent(deliveredEvent);
          }
          return undefined;
        };
        wrappers.set(key, wrapped);
      }

      return nativeAdd(type, wrapped, options);
    };

    target.removeEventListener = function removeEventListenerWithTimedTextGuard(
      type,
      listener,
      options
    ) {
      const wrapped = listenerRegistry.get(listener)?.get(keyFor(type, options));
      return nativeRemove(type, wrapped || listener, options);
    };
  }

  installEventDetailBridge(typeof document === "object" ? document : null);
  if (typeof window === "object" && window !== document) {
    installEventDetailBridge(window);
  }
})();
