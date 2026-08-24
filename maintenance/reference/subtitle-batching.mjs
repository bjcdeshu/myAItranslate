/**
 * Resolve request limits while keeping subtitle batching independent from
 * normal webpage translation batching.
 */
export function resolveTextLengthLimits({
  maxTextLength,
  maxTextGroupLength,
  serviceConfig = {},
  usageScene,
}) {
  let resolvedTextLength = serviceConfig.maxTextLengthPerRequest || maxTextLength;
  let resolvedGroupLength =
    serviceConfig.maxTextGroupLengthPerRequest || maxTextGroupLength;

  const isSubtitleScene =
    typeof usageScene === "string" &&
    (usageScene === "subtitle" || usageScene.startsWith("subtitle_"));

  if (
    isSubtitleScene &&
    serviceConfig.maxTextGroupLengthPerRequestForSubtitle
  ) {
    resolvedGroupLength =
      serviceConfig.maxTextGroupLengthPerRequestForSubtitle;
  }

  const numericGroupLength = Number(resolvedGroupLength);
  resolvedGroupLength =
    Number.isFinite(numericGroupLength) && numericGroupLength > 0
      ? Math.max(1, Math.floor(numericGroupLength))
      : Math.max(1, Math.floor(Number(maxTextGroupLength) || 1));

  return {
    maxTextLength: resolvedTextLength,
    maxTextGroupLength: resolvedGroupLength,
  };
}
