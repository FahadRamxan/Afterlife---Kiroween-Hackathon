'use client';
// useProjectLive(id): the project's live events over a WebSocket. Reconnects with back-off and
// resumes after the last event it has (?after=), so nothing is missed and nothing shows twice.
import { useEffect, useState } from 'react';
import { isFinalClose, liveUrl, mergeEvents, reconnectDelay, type LiveEvent } from './live';

export type LiveStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unconfigured';

export function useProjectLive(
  projectId: string,
  api: string | undefined = process.env.NEXT_PUBLIC_API_URL,
): { events: LiveEvent[]; status: LiveStatus; closeReason: string | null } {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState<LiveStatus>(api ? 'connecting' : 'unconfigured');
  const [closeReason, setCloseReason] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let last: number | undefined;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(liveUrl(api, projectId, last));
      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
      };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(String(m.data)) as LiveEvent;
          last = Math.max(last ?? 0, e.seq);
          setEvents((prev) => mergeEvents(prev, [e]));
        } catch {
          /* not an event */
        }
      };
      ws.onclose = (c) => {
        if (stopped) return;
        if (isFinalClose(c.code) || c.code === 4503) {
          setStatus('closed');
          setCloseReason(c.reason || String(c.code));
          return;
        }
        setStatus('reconnecting');
        timer = setTimeout(connect, reconnectDelay(attempt++));
      };
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [api, projectId]);

  return { events, status, closeReason };
}
