'use client';

import { useEffect, useRef } from 'react';

export const useIdleTimeout = (onExpire: () => void, timeoutMs = 10 * 60 * 1000) => {
  const timer = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(onExpire, timeoutMs);
    };
    const events: Array<keyof DocumentEventMap> = ['mousemove', 'keydown', 'click'];
    events.forEach((ev) => document.addEventListener(ev, reset));
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((ev) => document.removeEventListener(ev, reset));
    };
  }, [onExpire, timeoutMs]);
};






