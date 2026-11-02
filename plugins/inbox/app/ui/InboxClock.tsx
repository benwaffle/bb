import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createInboxClock,
  needsSecondTicks,
  type InboxClock,
  type Ticker,
} from "../model/clock.js";

const fallbackClock = createInboxClock();
const InboxClockContext = createContext<InboxClock>(fallbackClock);

export function InboxClockProvider({ children }: { children: ReactNode }) {
  const [clock] = useState(createInboxClock);
  return (
    <InboxClockContext.Provider value={clock}>
      {children}
    </InboxClockContext.Provider>
  );
}

const idleTicker: Ticker = {
  subscribe: () => () => {},
  now: () => 0,
};

function useTickerNow(ticker: Ticker): number {
  return useSyncExternalStore(ticker.subscribe, ticker.now, ticker.now);
}

export function useMinuteNow(): number {
  return useTickerNow(useContext(InboxClockContext).minutes);
}

export function useElapsedNow(since: number): number {
  const clock = useContext(InboxClockContext);
  const minuteNow = useTickerNow(clock.minutes);
  const fine = needsSecondTicks(since, minuteNow);
  const secondNow = useTickerNow(fine ? clock.seconds : idleTicker);
  return Math.max(minuteNow, secondNow);
}
