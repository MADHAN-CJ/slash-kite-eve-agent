'use client';

import { useEffect, useState } from 'react';

export function useTourLaunch(initial = false) {
  const [show, setShow] = useState(initial);
  const [launch, setLaunch] = useState(false);
  const [pulse, setPulse] = useState(0);
  const pulseGate = () => setPulse((n) => n + 1);

  useEffect(() => {
    if (!launch) return;
    const hide = window.setTimeout(() => setShow(false), 500);
    const banner = window.setTimeout(pulseGate, 900);
    const done = window.setTimeout(() => setLaunch(false), 1300);
    return () => [hide, banner, done].forEach((timer) => window.clearTimeout(timer));
  }, [launch]);

  const finish = (animate: boolean) => {
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) setLaunch(true);
    else {
      setShow(false);
      if (animate) pulseGate();
    }
  };

  return { show, setShow, launch, pulse, pulseGate, finish };
}
