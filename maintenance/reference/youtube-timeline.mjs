const FALLBACK_DURATION_MS = 3000;
const MIN_DURATION_MS = 100;
const MAX_DURATION_MS = 30000;

function toText(event) {
  if (typeof event?.text === "string") return event.text;
  if (!Array.isArray(event?.segs)) return "";
  return event.segs.map((segment) => segment?.utf8 || "").join("");
}

function cleanText(text) {
  return String(text).replaceAll("\n", " ").trim();
}

/**
 * Normalize YouTube JSON3 events without discarding zero-duration or append
 * events. The output remains compatible with the extension's existing event
 * shape.
 */
export function normalizeYoutubeEvents(input) {
  const events = Array.isArray(input) ? input : input?.events || [];

  const prepared = events
    .map((event, order) => {
      const start = Number(event?.tStartMs);
      if (!Number.isFinite(start) || start < 0) return null;

      const rawText = toText(event).replaceAll("\n", " ");
      if (!rawText.trim()) return null;

      const duration = Number(event?.dDurationMs);
      return {
        ...event,
        tStartMs: start,
        dDurationMs:
          Number.isFinite(duration) && duration > 0 ? duration : 0,
        text: rawText,
        segs: [{ utf8: rawText }],
        __imtOrder: order,
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.tStartMs - right.tStartMs || left.__imtOrder - right.__imtOrder,
    );

  const appended = [];
  for (const event of prepared) {
    const previous = appended.at(-1);
    const sameWindow =
      previous &&
      event.wWinId != null &&
      previous.wWinId === event.wWinId;
    const nearPrevious =
      previous &&
      event.tStartMs <=
        previous.tStartMs + Math.max(previous.dDurationMs || 0, 5000);

    if (event.aAppend === 1 && previous && (sameWindow || nearPrevious)) {
      const previousClean = cleanText(previous.text);
      const currentClean = cleanText(event.text);

      if (currentClean.startsWith(previousClean)) {
        previous.text = event.text;
      } else if (!previousClean.endsWith(currentClean)) {
        previous.text += event.text;
      }

      const appendEnd =
        event.tStartMs + event.dDurationMs - previous.tStartMs;
      if (appendEnd > previous.dDurationMs) {
        previous.dDurationMs = appendEnd;
      }
      continue;
    }

    appended.push(event);
  }

  const deduplicated = [];
  for (const event of appended) {
    const text = cleanText(event.text);
    if (!text) continue;

    const previous = deduplicated.at(-1);
    if (previous?.tStartMs === event.tStartMs && previous.text === text) {
      previous.dDurationMs = Math.max(
        previous.dDurationMs,
        event.dDurationMs,
      );
      continue;
    }

    const normalized = {
      ...event,
      text,
      segs: [{ utf8: text }],
    };
    delete normalized.aAppend;
    deduplicated.push(normalized);
  }

  return deduplicated.map((event, index) => {
    let nextIndex = index + 1;
    while (
      nextIndex < deduplicated.length &&
      deduplicated[nextIndex].tStartMs <= event.tStartMs
    ) {
      nextIndex += 1;
    }

    const nextStart = deduplicated[nextIndex]?.tStartMs;
    const distanceToNext =
      Number.isFinite(nextStart) && nextStart > event.tStartMs
        ? nextStart - event.tStartMs
        : 0;

    let duration = event.dDurationMs;
    if (!(duration > 0)) duration = distanceToNext || FALLBACK_DURATION_MS;
    if (distanceToNext > 0 && duration > distanceToNext) {
      duration = distanceToNext;
    }
    duration = Math.max(
      MIN_DURATION_MS,
      Math.min(duration, MAX_DURATION_MS),
    );

    const normalized = { ...event, dDurationMs: duration };
    delete normalized.__imtOrder;
    return normalized;
  });
}

/**
 * Match translated cues to source cues by time instead of array index.
 * Each translated cue can be consumed at most once.
 */
export function alignSubtitleTranslation(
  sourceEvents,
  translatedEvents,
  toleranceMs = 1000,
) {
  let translatedIndex = 0;

  return sourceEvents.map((source) => {
    while (
      translatedIndex < translatedEvents.length &&
      translatedEvents[translatedIndex].tStartMs <
        source.tStartMs - toleranceMs
    ) {
      translatedIndex += 1;
    }

    let bestIndex = -1;
    let bestDistance = toleranceMs + 1;
    for (
      let index = translatedIndex;
      index < translatedEvents.length &&
      translatedEvents[index].tStartMs <= source.tStartMs + toleranceMs;
      index += 1
    ) {
      const distance = Math.abs(
        translatedEvents[index].tStartMs - source.tStartMs,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) return "";
    translatedIndex = bestIndex + 1;
    return translatedEvents[bestIndex].text || "";
  });
}
