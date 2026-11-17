import { memo, useEffect, useRef, useState } from "react";
import {
  estimateThinkingTokens,
  formatThinkingTokenEstimate,
} from "./thinking-token-estimate.js";

export const THINKING_TOKEN_COUNT_UPDATE_INTERVAL_MS = 500;

function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(() => value);
  const lastUpdatedAtRef = useRef(0);

  useEffect(() => {
    if (Object.is(value, throttledValue)) {
      return;
    }
    const waitMs = Math.max(
      0,
      lastUpdatedAtRef.current + intervalMs - Date.now(),
    );
    const timeoutId = window.setTimeout(() => {
      lastUpdatedAtRef.current = Date.now();
      setThrottledValue(() => value);
    }, waitMs);
    return () => window.clearTimeout(timeoutId);
  }, [intervalMs, throttledValue, value]);

  return throttledValue;
}

interface ThinkingTokenCountProps {
  textLength: number;
}

function ThinkingTokenCountComponent({ textLength }: ThinkingTokenCountProps) {
  const tokens = estimateThinkingTokens(
    useThrottledValue(textLength, THINKING_TOKEN_COUNT_UPDATE_INTERVAL_MS),
  );
  if (tokens === 0) {
    return null;
  }
  return (
    <span
      data-thinking-token-count=""
      title="Estimated from the streamed thinking summary, which is shorter than the full thinking"
      className="shrink-0 whitespace-pre text-sm leading-5 text-muted-foreground tabular-nums"
    >
      {formatThinkingTokenEstimate(tokens)}
    </span>
  );
}

export const ThinkingTokenCount = memo(ThinkingTokenCountComponent);
