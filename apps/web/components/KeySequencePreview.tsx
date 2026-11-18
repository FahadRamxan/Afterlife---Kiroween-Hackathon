'use client';

import { KeyParseError, jsdosKeys, parseKeys, type KeyStroke } from '@afterlife/emulator';
import { useId, useState } from 'react';

type Parsed = { ok: true; strokes: KeyStroke[]; presses: number } | { ok: false; error: string };

function parse(seq: string): Parsed {
  try {
    const strokes = parseKeys(seq);
    return { ok: true, strokes, presses: jsdosKeys(strokes).length };
  } catch (e) {
    if (e instanceof KeyParseError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Type a key sequence and see how the Possessor would press it in the old app. */
export function KeySequencePreview({ initial }: { initial: string }) {
  const id = useId();
  const [seq, setSeq] = useState(initial);
  const parsed = parse(seq);
  return (
    <div className="space-y-3" lang="en" dir="ltr">
      <label htmlFor={id} className="block text-sm font-medium">
        Key sequence
      </label>
      <input
        id={id}
        value={seq}
        onChange={(e) => setSeq(e.target.value)}
        spellCheck={false}
        className="w-full max-w-xl rounded-md border border-bone/25 bg-black px-3 py-2 font-mono text-sm text-bone focus-visible:outline-2 focus-visible:outline-ectoplasm"
      />
      {parsed.ok ? (
        <>
          <ol aria-label="Keystrokes" className="flex flex-wrap gap-2 font-mono text-sm">
            {parsed.strokes.map((s, i) => (
              <li
                key={i}
                className={
                  s.kind === 'text'
                    ? 'rounded border border-bone/25 px-2 py-0.5 text-bone'
                    : 'rounded bg-ectoplasm px-2 py-0.5 text-graveyard'
                }
              >
                {s.kind === 'text' ? `type "${s.text}"` : [...s.mods, s.key].join('+')}
              </li>
            ))}
          </ol>
          <p role="status" className="text-xs text-bone/75">
            {parsed.strokes.length} keystrokes, {parsed.presses} key presses in js-dos
          </p>
        </>
      ) : (
        <p role="alert" className="text-sm text-blood">
          {parsed.error}
        </p>
      )}
    </div>
  );
}
