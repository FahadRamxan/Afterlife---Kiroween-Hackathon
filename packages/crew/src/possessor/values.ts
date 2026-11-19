// What the Possessor types into a field (Prompt 48). crew.md: the LLM only picks sensible input
// values ("a medicine name", "a quantity"); code checks the answer fits the field. Without a model
// the values come from the app's own data files, and the log says so.
import { readDbf, type DbfValue } from '@afterlife/dbf';
import type { EmulatorController } from '@afterlife/emulator';
import { z } from 'zod';
import type { CrewLlm } from '../llm/runtime';
import type { FieldInfo } from './actions';
import { probes, screenDate, typeField, typicalValue } from './inputs';
import { isPersonalField, maskFor, redactor } from './privacy';

/** A few records of each data file, so a value can name a real code, id or name. */
export type DataSample = {
  file: string;
  fields: { name: string; type: string; length: number }[];
  records: Record<string, string>[];
  /** Its fields about a person (privacy.ts): never shown to the model. */
  personalFields?: string[];
  /** Their values in every record, not only the first few, so a screen can be masked too. */
  personalValues?: string[];
  personalByField?: Record<string, string[]>;
};

/** At most this many records of a file are read for personal values. */
const MAX_PERSONAL_RECORDS = 20_000;

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
  /** The value, and why it was chosen ("typical", "zero", "new-key"...) when known. */
  choose(ctx: ValueContext): Promise<string | { value: string; why?: string }>;
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
      const live = dbf.records.filter((r) => !r.deleted);
      const personalFields = dbf.fields
        .map((f) => f.name)
        .filter((name) => isPersonalField(file, name));
      const personalByField = Object.fromEntries(
        personalFields.map((name) => [
          name,
          [
            ...new Set(
              live
                .slice(0, MAX_PERSONAL_RECORDS)
                .map((r) => text(r.values[name] ?? null).trim())
                .filter(Boolean),
            ),
          ],
        ]),
      );
      out.push({
        file,
        fields: dbf.fields.map((f) => ({ name: f.name, type: f.type, length: f.length })),
        records: live
          .slice(0, n)
          .map((r) => Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, text(v)]))),
        personalFields,
        personalValues: Object.values(personalByField).flat(),
        personalByField,
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

/**
 * A typical value from the input strategy (inputs.ts): a field named like a data file field gives
 * a real value ("Code" gives a medicine CODE), a quantity is 1, an amount is 100.00, a date is the
 * app's own date, and "blank" in the label means blank. Deterministic.
 */
export function dataValue(ctx: ValueContext): string {
  return typicalValue(typeField(ctx.field, ctx.samples), screenDate(ctx.screen));
}

/**
 * The next value for a field (Prompt 49): the first time, `first` (the model) or a typical value;
 * each time after, the next boundary value not yet typed there (0, the full width, a negative, a
 * date before or after 2000, a key that does not exist). Every value fits the field.
 */
export function strategyChooser(first?: ValueChooser): ValueChooser {
  return {
    source: first?.source ?? 'data',
    async choose(ctx) {
      const t = typeField(ctx.field, ctx.samples);
      const today = screenDate(ctx.screen);
      if (ctx.tried.length === 0) {
        const v = first
          ? await first.choose(ctx)
          : { value: typicalValue(t, today), why: 'typical' };
        return typeof v === 'string' ? { value: v, why: 'typical' } : v;
      }
      const next = probes(t, today).find((p) => !ctx.tried.includes(p.value));
      return next ?? { value: typicalValue(t, today), why: 'typical' };
    },
  };
}

export const dataValueChooser: ValueChooser = strategyChooser();

/** The model's instructions: what the field is for, and how to answer. */
export function valuePrompt(ctx: ValueContext): string {
  // Nothing about a person goes to the model (review 41-50): masked in the records and the screen.
  const redact = redactor(ctx.samples);
  const sample = ctx.samples
    .map(
      (s) =>
        `${s.file} (${s.fields.map((f) => `${f.name} ${f.type}(${f.length})`).join(', ')}):\n` +
        s.records
          .map(
            (r) =>
              `  ${Object.entries(r)
                .map(([k, v]) =>
                  (s.personalFields ?? []).includes(k) && v ? maskFor(k) : redact(v),
                )
                .join(' | ')}`,
          )
          .join('\n'),
    )
    .join('\n');
  return [
    `Screen: ${ctx.title}`,
    ...ctx.screen.map((l) => `| ${redact(l)}`),
    '',
    `Field: ${ctx.field.label || '(no label)'}`,
    `Width: ${ctx.field.length ?? 'not shown'}`,
    ctx.tried.length
      ? `Already tried here: ${ctx.tried.map((t) => JSON.stringify(redact(t))).join(', ')}`
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
