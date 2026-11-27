'use client';

import { type FormEvent, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Icon, StopIcon } from './icons';

/**
 * The one box (markets-hero app.js "composers"). It appears twice: on the
 * empty screen (`form0`) and docked under a conversation (`form1`). The chip
 * says what the words read as — a question or a watcher — and where the data
 * comes from. Enter sends where a pointer can hover; on touch it is a newline.
 */

export const PLACEHOLDER = 'Ask about a level, an indicator or a stock';
const MAX_HEIGHT = 180;

export const isWatchIntent = (text: string): boolean =>
  /\b(tell me when|alert|notify|watch|ping me|let me know when)\b/i.test(text);

interface SpeechRecognitionLike {
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

export interface ComposerHandle {
  focus(): void;
  setValue(value: string, select?: { start: number; end: number }): void;
}

export function Composer({
  id,
  main,
  busy,
  disabled,
  gate,
  onFocusGated,
  placeholder = PLACEHOLDER,
  dataLabel,
  initialValue = '',
  pulseKey,
  handle,
  onSend,
  onStop,
}: {
  readonly id: string;
  /** The empty-screen composer; the docked one is not `main`. */
  readonly main?: boolean;
  readonly busy: boolean;
  readonly disabled?: boolean;
  /**
   * The Kite gate: `readonly` keeps the box visible but not typable (a tap opens
   * the Connect Kite dialog); `off` greys it out and one tap reconnects (morning).
   */
  readonly gate?: 'readonly' | 'off';
  readonly onFocusGated?: () => void;
  readonly placeholder?: string;
  /** The small tag on the chip: where the data comes from (`KITE`). */
  readonly dataLabel: string;
  readonly initialValue?: string;
  /** Changes when a run starts: replays the blue pulse on the visible box. */
  readonly pulseKey?: number;
  readonly handle?: Ref<ComposerHandle>;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);

  const grow = () => {
    const t = input.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, MAX_HEIGHT)}px`;
  };
  // The height follows what was typed. An untouched box keeps its one-row height (the prototype
  // only measures on input), so a placeholder that wraps on a phone does not stretch it.
  const touched = useRef(initialValue !== '');
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useEffect(() => {
    if (value !== '') touched.current = true;
    if (touched.current) grow();
  }, [value]);
  // Text wraps differently once the web font arrives or the window changes width.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listeners are set up once
  useEffect(() => {
    const remeasure = () => {
      if (touched.current) grow();
    };
    void document.fonts?.ready.then(remeasure);
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    setCanSpeak(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  useImperativeHandle(handle, () => ({
    focus: () => input.current?.focus({ preventScroll: true }),
    setValue: (next, select) => {
      setValue(next);
      requestAnimationFrame(() => {
        input.current?.focus({ preventScroll: true });
        if (select) input.current?.setSelectionRange(select.start, select.end);
      });
    },
  }));

  // The pulse: remove the class, force a reflow, add it again — only on the box that is on screen.
  useEffect(() => {
    const f = form.current;
    if (!f || pulseKey === undefined || pulseKey === 0) return;
    f.classList.remove('pulse');
    void f.offsetWidth;
    if (f.offsetParent) f.classList.add('pulse');
  }, [pulseKey]);

  const send = () => {
    const text = value.trim();
    if (!text || busy) return;
    setValue('');
    onSend(text);
  };

  const readOnly = gate === 'readonly';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (gate) {
      onFocusGated?.();
      return;
    }
    if (busy) onStop();
    else send();
  };

  const toggleMic = () => {
    if (rec.current) {
      rec.current.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    const base = value ? `${value} ` : '';
    r.interimResults = true;
    r.lang = navigator.language || 'en-US';
    r.onresult = (e) => setValue(base + Array.from(e.results, (x) => x[0]?.transcript ?? '').join(''));
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    r.onerror = () => {};
    try {
      r.start();
      rec.current = r;
      setListening(true);
    } catch {
      rec.current = null;
    }
  };

  const watch = isWatchIntent(value);

  return (
    <form
      className={gate === 'off' ? 'cmp off9' : 'cmp'}
      data-main={main ? '1' : undefined}
      id={id}
      onClick={(e) => {
        if (gate === 'off') {
          e.preventDefault();
          onFocusGated?.();
          return;
        }
        if (!(e.target as HTMLElement).closest('button,textarea')) input.current?.focus();
      }}
      onSubmit={submit}
      ref={form}
    >
      <textarea
        aria-label="Message"
        className="in"
        disabled={disabled}
        enterKeyHint="send"
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => {
          if (readOnly && onFocusGated) {
            input.current?.blur();
            onFocusGated();
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
          if (!window.matchMedia('(hover:hover)').matches) return;
          e.preventDefault();
          if (!busy) send();
        }}
        placeholder={placeholder}
        readOnly={readOnly}
        ref={input}
        rows={1}
        value={value}
      />
      <div className="crow">
        <button aria-label="Add" className="ib" data-a="add" type="button">
          <Icon name="plus" />
        </button>
        <span style={{ flex: 1 }} />
        <span aria-live="polite" className={watch ? 'schip w' : 'schip'}>
          <Icon name={watch ? 'bell' : 'search'} />
          {watch ? 'Watch' : 'Search markets'} <small>{dataLabel}</small>
        </span>
        <button aria-label="Voice" className={listening ? 'ib mic on' : 'ib mic'} hidden={!canSpeak} onClick={toggleMic} type="button">
          <Icon name="mic" />
        </button>
        <span className="esc5">esc to stop</span>
        <button aria-label={busy ? 'Stop' : 'Send'} className="ib send" disabled={!busy && !value.trim()} type="submit">
          {busy ? <StopIcon /> : <Icon name="up" />}
        </button>
      </div>
    </form>
  );
}
