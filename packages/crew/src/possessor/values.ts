// What the Possessor types into a field (Prompt 48). crew.md: the LLM only picks sensible input
// values ("a medicine name", "a quantity"); code checks the answer fits the field. Without a model
// the values come from the app's own data files, and the log says so.
import { readDbf, type DbfValue } from '@afterlife/dbf';
import type { EmulatorController } from '@afterlife/emulator';
import { z } from 'zod';
import type { CrewLlm } from '../llm/runtime';
import type { FieldInfo } from './actions';

/** A few records of each data file, so a value can name a real code, id or name. */
export type DataSample = {
  file: string;
  fields: { name: string; type: string; length: number }[];
  records: Record<string, string>[];
};

export type ValueContext = {
  field: FieldInfo;
  /** The screen's title ("NEW BILL"). */
  title: string;
  /** The screen's lines, blank ones left out. */
  screen: string[];
  samples: DataSample[];
  /** Values already typed into this field, so a chooser can vary them. */
  tried: string[];
};

export interface ValueChooser {
  /** `model`: an LLM proposed it; `data`: taken from the data files without a model. */
  readonly source: 'model' | 'data';
  choose(ctx: ValueContext): Promise<string>;
}

const text = (v: DbfValue): string =>
  v === null ? '' : typeof v === 'boolean' ? (v ? 'T' : 'F') : String(v);

/** The first `n` live records of every .DBF on drive C:, as text. */
export async function readSamples(emu: EmulatorController, n = 5): Promise<DataSample[]> {
  const files = (await emu.listFiles()).filter((f) => /\.DBF$/i.test(f));
  const out: DataSample[] = [];
  for (const file of files) {
    try {
      const dbf = readDbf(await emu.readFile(file));
      out.push({
        file,
        fields: dbf.fields.map((f) => ({ name: f.name, type: f.type, length: f.length })),
        records: dbf.records
          .filter((r) => !r.deleted)
          .slice(0, n)
          .map((r) => Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, text(v)]))),
      });
    } catch {
      // A file the reader cannot read is left out; the Possessor still explores.
    }
  }
  return out;
}

/** The value cut to the field's width (the app would not take more). */
export const fitWidth = (value: string, length: number | null): string =>
  length === null ? value : value.slice(0, length);

const words = (s: string): string[] => s.toUpperCase().match(/[A-Z0-9]+/g) ?? [];

/**
 * A value from the data files: a field named like the label gives a real value ("Code" gives a
 * medicine CODE), a quantity is 1, a name or phone is clearly a test entry, and "blank" in the
 * label means blank is allowed. Deterministic.
 */
export function dataValue(ctx: ValueContext): string {
  const label = ctx.field.label;
  const w = words(label);
  let v: string;
  if (/\bblank\b/i.test(label)) v = '';
  else if (w.some((x) => ['QTY', 'QUANTITY', 'QNTY', 'NOS', 'UNITS'].includes(x))) v = '1';
  else if (w.includes('PHONE') || w.includes('MOBILE') || w.includes('TEL')) v = '051-0000000';
  else {
    const match = ctx.samples
      .flatMap((s) => s.fields.map((f) => ({ s, f })))
      .find(({ f }) =>
        w.some((x) => f.name === x || f.name.endsWith(`_${x}`) || f.name.startsWith(`${x}_`)),
      );
    const sample = match?.s.records.find((r) => (r[match.f.name] ?? '') !== '')?.[match!.f.name];
    if (w.includes('NAME') && !match?.f.name.includes('CODE')) v = 'AFTERLIFE TEST';
    else v = sample ?? 'TEST';
  }
  return fitWidth(v, ctx.field.length);
}

export const dataValueChooser: ValueChooser = {
  source: 'data',
  choose: async (ctx) => dataValue(ctx),
};

/** The model's instructions: what the field is for, and how to answer. */
export function valuePrompt(ctx: ValueContext): string {
  const sample = ctx.samples
    .map(
      (s) =>
        `${s.file} (${s.fields.map((f) => `${f.name} ${f.type}(${f.length})`).join(', ')}):\n` +
        s.records.map((r) => `  ${Object.values(r).join(' | ')}`).join('\n'),
    )
    .join('\n');
  return [
    `Screen: ${ctx.title}`,
    ...ctx.screen.map((l) => `| ${l}`),
    '',
    `Field: ${ctx.field.label || '(no label)'}`,
    `Width: ${ctx.field.length ?? 'not shown'}`,
    ctx.tried.length
      ? `Already tried here: ${ctx.tried.map((t) => JSON.stringify(t)).join(', ')}`
      : '',
    '',
    'Data files (first records):',
    sample,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export const VALUE_SYSTEM =
  'You explore a 1990s DOS business program by using it, as a shop worker would, to learn what it ' +
  'does. Give one sensible value to type into the field named below. When it asks for an existing ' +
  'record (a code, an id), use one from the data files. Leave it empty only if the screen says ' +
  'blank is allowed. Never type more characters than its width.';

export function llmValueChooser(llm: CrewLlm): ValueChooser {
  return {
    source: 'model',
    async choose(ctx) {
      const schema = z.object({
        value: z.string().max(ctx.field.length ?? 60),
        why: z.string().max(200).optional(),
      });
      const r = await llm.json(
        schema,
        {
          system: VALUE_SYSTEM,
          messages: [{ role: 'user', content: [{ type: 'text', text: valuePrompt(ctx) }] }],
          maxTokens: 300,
          temperature: 0,
          describe: 'The value to type, and why in a few words.',
        },
        {
          agent: 'possessor',
          purpose: `a value for ${ctx.field.label || 'a field'} on ${ctx.title}`,
        },
      );
      return fitWidth(r.value, ctx.field.length);
    },
  };
}
