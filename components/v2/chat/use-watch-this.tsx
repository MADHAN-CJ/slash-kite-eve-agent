'use client';

import { type RefObject, useState } from 'react';
import type { AnswerModel } from '@/lib/v2/answer-model';
import type { ComposerHandle } from './composer';
import { guessesFrom, type LevelGuess, WatchPanel, watchPrompt } from './watcher-card';

/**
 * Watch this (markets-hero run.js `watchFrom`): nothing is set. It guesses a
 * level from the answer's `ui:levels` block, writes the watcher question into
 * the box with the level selected, and offers the other levels above the box.
 * Without levels it just starts the question ("Tell me when SYMBOL ").
 */
export function useWatchThis(dock: RefObject<ComposerHandle | null>, busy: boolean) {
  const [watch, setWatch] = useState<{ symbol: string; guesses: LevelGuess[]; picked: number | 'own' } | null>(null);

  const prefill = (text: string, select?: string) => {
    const i = select ? text.indexOf(select) : -1;
    dock.current?.setValue(text, i >= 0 && select ? { start: i, end: i + select.length } : { start: text.length, end: text.length });
  };

  const watchFrom = (model: AnswerModel, fallbackSymbol: string) => {
    if (busy) return;
    const found = guessesFrom(model.text);
    const symbol = found?.symbol || fallbackSymbol;
    if (!found || !found.guesses.length) {
      setWatch(null);
      prefill(`Tell me when ${symbol} `);
      return;
    }
    const pick = found.guesses.length > 1 ? 1 : 0;
    setWatch({ symbol, guesses: found.guesses, picked: pick });
    const g = found.guesses[pick];
    prefill(watchPrompt(symbol, g), g.lv.toLocaleString('en-IN'));
  };

  const panel = watch ? (
    <WatchPanel
      guesses={watch.guesses}
      onClose={() => {
        setWatch(null);
        prefill('');
      }}
      onOwn={() => {
        setWatch({ ...watch, picked: 'own' });
        prefill(`Tell me when ${watch.symbol} `);
      }}
      onPick={(i) => {
        setWatch({ ...watch, picked: i });
        const g = watch.guesses[i];
        prefill(watchPrompt(watch.symbol, g), g.lv.toLocaleString('en-IN'));
      }}
      picked={watch.picked}
    />
  ) : null;

  return { panel, watchFrom, close: () => setWatch(null), prefill };
}
