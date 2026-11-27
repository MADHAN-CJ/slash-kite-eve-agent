'use client';

import { useEffect, useRef, useState } from 'react';

const TOPICS = [
  ['How to ask a good question', 'Name the symbol, the time frame and what you want to measure. For example, “Where has Reliance found support over the past 60 trading days?”'],
  ['Reading a receipt', 'Open Sources inside an answer to see the requests, inputs and timing. Open Code to review the calculation.'],
  ['Setting a watcher', 'Ask to be notified when a specific condition is met. Review the rule and select Start watching. You can manage the watcher from the sidebar.'],
  ['Connecting Kite', 'Select Connect Kite and sign in in the Kite window. Return to /markets when Kite finishes.'],
] as const;

export function TourHelp({ onReplay }: { readonly onReplay: () => void }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<number>();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="tour-help" ref={root}>
    <button aria-controls="tour-help-panel" aria-expanded={open} aria-label="Help" className="help" id="help" ref={button} onClick={() => { setTopic(undefined); setOpen(!open); }} type="button">?</button>
    <div className={open ? 'helpp on' : 'helpp'} id="tour-help-panel">
      <small>Help</small>
      <button className="rp" onClick={() => { setOpen(false); onReplay(); }} type="button">Replay the intro</button>
      {TOPICS.map(([title, body], index) => <div key={title}>
        <button aria-expanded={topic === index} onClick={() => setTopic(topic === index ? undefined : index)} type="button">{title}</button>
        {topic === index && <p>{body}</p>}
      </div>)}
    </div>
  </div>;
}
