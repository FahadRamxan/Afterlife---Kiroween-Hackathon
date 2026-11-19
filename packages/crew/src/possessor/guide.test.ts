import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { attachHints, guideFromSeance, type SeanceAction } from './guide';

/** A séance action: keys pressed on screen `from`, leading to screen `to`. */
const act = (keys: string, from: string, to = from, atMs?: number): SeanceAction => ({
  keys,
  screenBefore: { fingerprint: from },
  screenAfter: { fingerprint: to },
  ...(atMs === undefined ? {} : { atMs }),
});

describe('guideFromSeance', () => {
  it('joins the keys typed into a field, with the Enter that ends it, into one step', () => {
    const seance = [
      act('1', 'menu', 'bill'),
      act('{Enter}', 'bill', 'lines'),
      ...[...'PAN500'].map((c) => act(c, 'lines')),
      act('{Enter}', 'lines', 'qty'),
      act('2', 'qty'),
      act('{Enter}', 'qty', 'lines'),
      act('{Enter}', 'lines', 'totals'),
      act('{F2}', 'totals'),
    ];
    expect(guideFromSeance(seance).map((s) => s.keys)).toEqual([
      '1',
      '{Enter}',
      'PAN500{Enter}',
      '2{Enter}',
      '{Enter}',
      '{F2}',
    ]);
    expect(guideFromSeance(seance)[2]!.from).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('a mistake corrected with Backspace stays in the step, as the owner typed it', () => {
    const s = guideFromSeance([
      act('X', 'f'),
      act('{Backspace}', 'f'),
      act('A', 'f'),
      act('{Enter}', 'f', 'g'),
    ]);
    expect(s.map((x) => x.keys)).toEqual(['X{Backspace}A{Enter}']);
  });

  it('a step carries what the owner said over any of its keys', () => {
    const s = guideFromSeance(
      [act('3', 'menu', 'custs'), act('A', 'custs', 'add')],
      ['customers', 'naya gahak'],
    );
    expect(s.map((x) => x.hint)).toEqual(['customers', 'naya gahak']);
  });

  it('every séance action is in exactly one step, in order (invariant)', () => {
    const screen = fc.constantFrom('a', 'b', 'c');
    const keys = fc.constantFrom('1', 'A', 'x', '{Enter}', '{F2}', '{Esc}', '{Backspace}');
    fc.assert(
      fc.property(fc.array(fc.tuple(keys, screen, screen), { maxLength: 40 }), (xs) => {
        const steps = guideFromSeance(xs.map(([k, a, b]) => act(k, a, b)));
        expect(steps.flatMap((s) => s.from)).toEqual(xs.map((_, i) => i));
      }),
    );
  });
});

describe('attachHints', () => {
  it('a segment goes to the last action pressed before it ended', () => {
    const actions = [{ atMs: 1000 }, { atMs: 4000 }, { atMs: 9000 }];
    expect(
      attachHints(actions, [
        { startMs: 200, endMs: 800, text: 'pehle bill' },
        { startMs: 4200, endMs: 6000, text: 'yeh GST hai' },
        { startMs: 9500, endMs: 11000, text: 'save' },
      ]),
    ).toEqual(['pehle bill', 'yeh GST hai', 'save']);
  });

  it('an old séance without times gets every note on its first action', () => {
    expect(
      attachHints(
        [{}, {}],
        [
          { startMs: 0, endMs: 5, text: 'a' },
          { startMs: 9, endMs: 20, text: 'b' },
        ],
      ),
    ).toEqual(['a b', undefined]);
  });

  it('every spoken word lands on exactly one action, in time order (invariant)', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.nat(60_000), { minLength: 1, maxLength: 20 })
          .map((t) => t.sort((a, b) => a - b)),
        fc.array(
          fc.record({
            startMs: fc.nat(60_000),
            len: fc.nat(5000),
            w: fc.stringMatching(/^[a-z]{1,6}$/),
          }),
          { maxLength: 15 },
        ),
        (times, segs) => {
          const segments = segs.map((s) => ({
            startMs: s.startMs,
            endMs: s.startMs + s.len,
            text: s.w,
          }));
          const hints = attachHints(
            times.map((atMs) => ({ atMs })),
            segments,
          );
          expect(hints).toHaveLength(times.length);
          const words = hints.flatMap((h) => (h ? h.split(' ') : []));
          expect(words.sort()).toEqual(segments.map((s) => s.text).sort());
        },
      ),
    );
  });
});
