// The Exorcist's detectors (Prompt 73): each reads the Soul, the old app's records and what it
// showed on screen, and gives findings with the evidence. Deterministic: what the old app did
// decides, and a finding without evidence is never made.
import Decimal from 'decimal.js';
import type { DbfRecord, DbfValue } from '@afterlife/dbf';
import type { Entity } from '@afterlife/soul';
import type { Evidence, ExorcistInput, Finding, ObservedStep, Severity, Smell } from './types';

type Field = Entity['fields'][number];
const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const live = (rs: DbfRecord[] | undefined) => (rs ?? []).filter((r) => !r.deleted);
const recordsOf = (input: ExorcistInput, e: Entity) =>
  live(input.records[e.file] ?? input.records[e.file.toUpperCase()]);
const keyOf = (e: Entity) => (e.key.length === 1 ? e.key[0]! : null);
const target = (e: Entity, f: string) => `${e.id.replace(/-/g, '_')}.${f.toLowerCase()}`;
const rupees = (d: Decimal) => d.toFixed(2);
const lines = (o: ObservedStep) => o.screenAfter.text;
const ymd = (iso: string) => iso.replace(/-/g, '');

/** The year the app has been doing it since: the earliest date in the records its actions write. */
export function sinceYear(input: ExorcistInput): number | null {
  const written = new Set(
    input.soul.actions.flatMap((a) =>
      a.effects.filter((x) => x.kind === 'insert').map((x) => x.entity),
    ),
  );
  let min: number | null = null;
  for (const e of input.soul.entities.filter((x) => written.has(x.id)))
    for (const f of e.fields.filter((x) => x.type === 'D'))
      for (const r of recordsOf(input, e)) {
        const d = str(r.values[f.name]);
        if (/^\d{8}$/.test(d)) min = Math.min(min ?? 9999, Number(d.slice(0, 4)));
      }
  return min ?? (Number(input.today.slice(0, 4)) || null);
}

function finding(
  input: ExorcistInput,
  smell: Smell,
  severity: Severity,
  at: { entity?: Entity; field?: string },
  text: { titleEn: string; titleUr: string; en: string; ur: string },
  evidence: Evidence[],
): Finding {
  const t = at.entity && at.field ? target(at.entity, at.field) : undefined;
  return {
    code: `${smell}:${t ?? 'app'}`,
    smell,
    severity,
    ...(t ? { target: t } : {}),
    ...text,
    since: sinceYear(input),
    evidence,
  };
}

// ---- Two-digit years

const PAST = /\b(EXPIRED|OVERDUE|PAST DUE|LAPSED)\b/i;
/** The two-digit shows of a YYYYMMDD date: 30/06/00, 30-06-00, 30.06.00. */
const shortDates = (d: string) =>
  ['/', '-', '.'].map((s) => `${d.slice(6, 8)}${s}${d.slice(4, 6)}${s}${d.slice(2, 4)}`);
const showsShort = (line: string, d: string) =>
  shortDates(d).some((s) =>
    new RegExp(`(^|[^0-9])${s.replace(/[.]/g, '\\.')}([^0-9]|$)`).test(line),
  );

/**
 * Dates the old app treats with two-digit years: a record shown as expired (or overdue) next to its
 * own date in two digits, although its four-digit date is today or later. Dates only shown in two
 * digits, with nothing wrong seen, are a low risk.
 */
export function twoDigitYears(input: ExorcistInput): Finding[] {
  const today = ymd(input.today);
  const out: Finding[] = [];
  for (const e of input.soul.entities) {
    const key = keyOf(e);
    if (!key) continue;
    for (const f of e.fields.filter((x) => x.type === 'D')) {
      const wrong: Evidence[] = [];
      const shown: Evidence[] = [];
      const seen = new Set<string>();
      for (const r of recordsOf(input, e)) {
        const k = str(r.values[key]);
        const d = str(r.values[f.name]);
        if (!k || !/^\d{8}$/.test(d)) continue;
        for (const o of input.observations)
          for (const line of lines(o)) {
            if (!line.includes(k) || !showsShort(line, d)) continue;
            const id = `${k} ${d}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const ev: Evidence = { kind: 'observation', ref: o.id, text: line.trim() };
            if (PAST.test(line) && d >= today)
              wrong.push({
                ...ev,
                text: `${line.trim()}  (${f.name} in ${e.file} is ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}, on ${input.today})`,
              });
            else shown.push(ev);
          }
      }
      if (wrong.length)
        out.push(
          finding(
            input,
            'two-digit-year',
            'high',
            { entity: e, field: f.name },
            {
              titleEn: `${e.name} ${f.name.toLowerCase()} is compared with two-digit years`,
              titleUr: `${e.name} کی ${f.name.toLowerCase()} دو ہندسوں والے سال سے جانچی جاتی ہے`,
              en: `The old app compares ${f.name} with two-digit years, so "00" counts as before "98": on ${input.today} it shows ${wrong.length} record${wrong.length === 1 ? '' : 's'} dated 2000 or later as past. From 2000 on, it would treat records from the 1990s as still good.`,
              ur: `پرانی ایپ ${f.name} کو دو ہندسوں والے سال سے جانچتی ہے، اس لیے "00" کو "98" سے پہلے سمجھتی ہے: ${input.today} کو یہ 2000 یا اس کے بعد کی تاریخ والے ${wrong.length} ریکارڈ کو گزرا ہوا دکھاتی ہے۔ 2000 کے بعد یہ 1990 کی دہائی کے ریکارڈ کو ابھی ٹھیک سمجھے گی۔`,
            },
            wrong,
          ),
        );
      else if (shown.length)
        out.push(
          finding(
            input,
            'two-digit-year',
            'low',
            { entity: e, field: f.name },
            {
              titleEn: `${e.name} ${f.name.toLowerCase()} is shown with two-digit years`,
              titleUr: `${e.name} کی ${f.name.toLowerCase()} دو ہندسوں والے سال کے ساتھ دکھائی جاتی ہے`,
              en: `The old app shows ${f.name} with two-digit years. Nothing wrong was seen, but a date after 1999 is easy to misread, and any check made on what is shown would fail.`,
              ur: `پرانی ایپ ${f.name} کو دو ہندسوں والے سال کے ساتھ دکھاتی ہے۔ کوئی غلطی نہیں دیکھی گئی، لیکن 1999 کے بعد کی تاریخ آسانی سے غلط پڑھی جا سکتی ہے۔`,
            },
            shown.slice(0, 5),
          ),
        );
    }
  }
  return out;
}

// ---- Numeric overflow

/** The most a dBASE numeric field holds: its width less the point and the decimals. */
export function capacity(f: Field): Decimal {
  const whole = f.length - (f.decimals > 0 ? f.decimals + 1 : 0);
  return new Decimal(10).pow(whole).minus(new Decimal(10).pow(-f.decimals));
}
const NUMBER = /^-?\d+(\.\d+)?$/;
const LIMIT_NAME = /(LIMIT|MAX|CAP|CEIL)/;

/**
 * Numbers too big for their fields: a value written as dBASE's ******** (it reads back as 0), a
 * limit that lets a field the app keeps adding to grow past what the field can hold, or a value
 * near the most it can hold.
 */
export function numericOverflow(input: ExorcistInput): Finding[] {
  const grown = new Set(
    input.soul.actions.flatMap((a) =>
      a.effects
        .filter((x) => x.kind === 'update')
        .flatMap((x) => x.fields.map((f) => `${x.entity}.${f}`)),
    ),
  );
  for (const r of input.soul.rules) if (r.kind !== 'validate' && r.target) grown.add(r.target);
  const out: Finding[] = [];
  for (const e of input.soul.entities) {
    const key = keyOf(e);
    const rs = recordsOf(input, e);
    for (const f of e.fields.filter((x) => x.type === 'N' || x.type === 'F')) {
      const max = capacity(f);
      const who = (r: DbfRecord, i: number) => (key ? str(r.values[key]) : `#${i + 1}`);
      const evidence: Evidence[] = [];
      let severity: Severity | null = null;
      rs.forEach((r, i) => {
        if (/^\*+$/.test(str(r.values[f.name]))) {
          evidence.push({
            kind: 'record',
            ref: `${e.file}#${i + 1}`,
            text: `${who(r, i)}: ${f.name} is ${str(r.values[f.name])}, too big for N(${f.length},${f.decimals}); it reads back as 0`,
          });
          severity = 'high';
        }
      });
      const isGrown = grown.has(`${e.id}.${f.name}`) || grown.has(target(e, f.name));
      if (isGrown) {
        for (const g of e.fields.filter(
          (x) => x !== f && (x.type === 'N' || x.type === 'F') && LIMIT_NAME.test(x.name),
        )) {
          const over = rs
            .map((r, i) => ({ r, i, v: str(r.values[g.name]) }))
            .filter((x) => NUMBER.test(x.v) && new Decimal(x.v).gt(max));
          if (over.length) {
            const x = over[0]!;
            evidence.push({
              kind: 'record',
              ref: `${e.file}#${x.i + 1}`,
              text: `${who(x.r, x.i)}: ${g.name} ${x.v} lets ${f.name} grow past ${rupees(max)}, the most N(${f.length},${f.decimals}) holds (${over.length} record${over.length === 1 ? '' : 's'})`,
            });
            severity = 'high';
          }
        }
        const near = rs
          .map((r, i) => ({ r, i, v: str(r.values[f.name]) }))
          .filter((x) => NUMBER.test(x.v) && new Decimal(x.v).abs().gte(max.times(0.9)));
        for (const x of near.slice(0, 3))
          evidence.push({
            kind: 'record',
            ref: `${e.file}#${x.i + 1}`,
            text: `${who(x.r, x.i)}: ${f.name} is ${x.v}, ${new Decimal(x.v).abs().div(max).times(100).floor()}% of the most it holds (${rupees(max)})`,
          });
        if (near.length) severity ??= 'medium';
      }
      if (severity && evidence.length)
        out.push(
          finding(
            input,
            'numeric-overflow',
            severity,
            { entity: e, field: f.name },
            {
              titleEn: `${e.name} ${f.name.toLowerCase()} can overflow its field`,
              titleUr: `${e.name} کا ${f.name.toLowerCase()} اپنی فیلڈ سے بڑا ہو سکتا ہے`,
              en: `${f.name} is N(${f.length},${f.decimals}), so it holds at most ${rupees(max)}. Above that dBASE writes ******** and the value reads back as 0: the whole amount disappears.`,
              ur: `${f.name} کی فیلڈ N(${f.length},${f.decimals}) ہے، اس لیے اس میں زیادہ سے زیادہ ${rupees(max)} آ سکتے ہیں۔ اس سے اوپر dBASE ******** لکھ دیتا ہے اور رقم صفر پڑھی جاتی ہے: پوری رقم غائب ہو جاتی ہے۔`,
            },
            evidence,
          ),
        );
    }
  }
  return out;
}

// ---- Negative stock or balance

const REFUSAL =
  /\b(NOT|CANNOT|CAN'T|ONLY|INVALID|EXCEEDS?|MORE THAN|LESS THAN|MUST|NO STOCK|OUT OF STOCK|ERROR)\b/i;
const QTY_LABEL = /\b(qty|quantity)\b/i;
const EDIT_KEY = /\bF\d{1,2}\s*=\s*Edit\b[^\n]*\b(qty|quantity)\b/i;

/** Stock or balances the app lets go below zero: written negative, or a 0 taken unchecked and editable. */
export function negativeAllowed(input: ExorcistInput): Finding[] {
  const kept = input.soul.actions.flatMap((a) =>
    a.effects
      .filter((x) => x.kind === 'update')
      .flatMap((x) => x.fields.map((f) => ({ entity: x.entity, field: f }))),
  );
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const k of kept) {
    const e = input.soul.entities.find((x) => x.id === k.entity);
    const f = e?.fields.find((x) => x.name === k.field && (x.type === 'N' || x.type === 'F'));
    if (!e || !f || seen.has(`${e.id}.${f.name}`)) continue;
    seen.add(`${e.id}.${f.name}`);
    const below: Evidence[] = [];
    for (const o of input.observations)
      for (const u of o.dbfDiff.tables[e.file]?.updated ?? [])
        for (const c of u.changes)
          if (c.field === f.name && NUMBER.test(str(c.after)) && new Decimal(str(c.after)).lt(0))
            below.push({
              kind: 'observation',
              ref: o.id,
              text: `${u.key ?? `#${u.afterRecno + 1}`}: ${f.name} ${str(c.before)} -> ${str(c.after)}`,
            });
    if (below.length) {
      out.push(negativeFinding(input, e, f, 'high', below));
      continue;
    }
    // A quantity of 0 typed at a quantity prompt and taken with no message, on a screen that offers
    // to edit the quantity afterwards: the stock check can be gone around.
    if (!QTY_LABEL.test(f.name) && !/STOCK/i.test(f.name)) continue;
    const zero = input.observations.find(
      (o) =>
        o.keys === '0{Enter}' &&
        o.screenBefore.text.some((l) => QTY_LABEL.test(l)) &&
        !lines(o).some((l) => REFUSAL.test(l) && !o.screenBefore.text.includes(l)),
    );
    const edit = input.observations
      .flatMap((o) => lines(o).map((l) => ({ o, l })))
      .find((x) => EDIT_KEY.test(x.l));
    if (zero && edit)
      out.push(
        negativeFinding(input, e, f, 'medium', [
          {
            kind: 'observation',
            ref: zero.id,
            text: `Typed 0{Enter} at "${zero.screenBefore.text.find((l) => QTY_LABEL.test(l))!.trim()}": the line was added with no stock check`,
          },
          {
            kind: 'observation',
            ref: edit.o.id,
            text: `The screen offers "${edit.l.trim().match(EDIT_KEY)![0]}": the quantity can be changed after the check`,
          },
        ]),
      );
  }
  return out;
}

function negativeFinding(
  input: ExorcistInput,
  e: Entity,
  f: Field,
  severity: Severity,
  evidence: Evidence[],
) {
  return finding(
    input,
    'negative-allowed',
    severity,
    { entity: e, field: f.name },
    {
      titleEn: `${e.name} ${f.name.toLowerCase()} can go below zero`,
      titleUr: `${e.name} کا ${f.name.toLowerCase()} صفر سے نیچے جا سکتا ہے`,
      en:
        severity === 'high'
          ? `The old app wrote ${f.name} below zero: it sold or paid out more than there was.`
          : `The old app takes a quantity of 0 without checking ${f.name}, and lets the quantity be edited after the check, so a bill can take ${f.name} below zero.`,
      ur:
        severity === 'high'
          ? `پرانی ایپ نے ${f.name} صفر سے کم لکھ دیا: جتنا تھا اس سے زیادہ بیچ دیا یا ادا کر دیا۔`
          : `پرانی ایپ 0 کی مقدار ${f.name} جانچے بغیر لے لیتی ہے، اور جانچ کے بعد مقدار بدلنے دیتی ہے، اس لیے ایک بل ${f.name} کو صفر سے نیچے لے جا سکتا ہے۔`,
    },
    evidence,
  );
}

// ---- Missing validation, duplicate keys, rounding

const NAME_FIELD = /^(NAME|[A-Z]+_NAME)$/;

/** A record the app saved with a blank name. */
export function missingValidation(input: ExorcistInput): Finding[] {
  const out = new Map<string, Finding>();
  for (const o of input.observations)
    for (const [file, t] of Object.entries(o.dbfDiff.tables)) {
      const e = input.soul.entities.find((x) => x.file === file);
      if (!e) continue;
      for (const f of e.fields.filter((x) => x.type === 'C' && NAME_FIELD.test(x.name)))
        for (const r of t.inserted)
          if (f.name in r.values && str(r.values[f.name]) === '') {
            const code = `missing-validation:${target(e, f.name)}`;
            const ev: Evidence = {
              kind: 'observation',
              ref: o.id,
              text: `${file} record ${r.key ?? `#${r.recno + 1}`} saved with ${f.name} blank`,
            };
            const had = out.get(code);
            if (had) had.evidence.push(ev);
            else
              out.set(
                code,
                finding(
                  input,
                  'missing-validation',
                  'medium',
                  { entity: e, field: f.name },
                  {
                    titleEn: `A ${e.name.toLowerCase()} can be saved with no ${f.name.toLowerCase()}`,
                    titleUr: `${e.name} بغیر ${f.name.toLowerCase()} کے محفوظ ہو سکتا ہے`,
                    en: `The old app saved a ${e.name.toLowerCase()} with ${f.name} blank: it does not check that it is filled in.`,
                    ur: `پرانی ایپ نے ${f.name} خالی چھوڑ کر ${e.name} محفوظ کر لیا: یہ نہیں جانچتی کہ یہ بھرا گیا ہے۔`,
                  },
                  [ev],
                ),
              );
          }
    }
  return [...out.values()];
}

/** Two live records with one key, in the data files or among those the app wrote. */
export function duplicateKeys(input: ExorcistInput): Finding[] {
  const out: Finding[] = [];
  for (const e of input.soul.entities) {
    const key = keyOf(e);
    if (!key) continue;
    const seen = new Map<string, number>();
    const evidence: Evidence[] = [];
    recordsOf(input, e).forEach((r, i) => {
      const k = str(r.values[key]);
      if (!k) return;
      if (seen.has(k))
        evidence.push({
          kind: 'record',
          ref: `${e.file}#${i + 1}`,
          text: `${key} ${k} is on record ${seen.get(k)! + 1} and record ${i + 1}`,
        });
      else seen.set(k, i);
    });
    for (const o of input.observations)
      for (const r of o.dbfDiff.tables[e.file]?.inserted ?? []) {
        const k = str(r.values[key]);
        if (k && seen.has(k))
          evidence.push({
            kind: 'observation',
            ref: o.id,
            text: `The app wrote a second ${key} ${k}`,
          });
      }
    if (evidence.length)
      out.push(
        finding(
          input,
          'duplicate-key',
          'medium',
          { entity: e, field: key },
          {
            titleEn: `Two ${e.name.toLowerCase()} records can share one ${key}`,
            titleUr: `دو ${e.name} ریکارڈ ایک ہی ${key} رکھ سکتے ہیں`,
            en: `${key} should name one ${e.name.toLowerCase()}, but the old app's data has two records with the same one: a lookup finds only the first.`,
            ur: `${key} سے ایک ہی ${e.name} پہچانا جانا چاہیے، لیکن پرانی ایپ کے ڈیٹا میں ایک ہی ${key} والے دو ریکارڈ ہیں: تلاش صرف پہلا ڈھونڈتی ہے۔`,
          },
          evidence.slice(0, 5),
        ),
      );
  }
  return out;
}

const NOISE = /^-?\d+\.\d*(9{4,}|0{4,}[1-9])\d*$/;

/** Values the app wrote with float noise (849.9999999): money worked out in floating point. */
export function roundingNoise(input: ExorcistInput): Finding[] {
  const evidence: Evidence[] = [];
  for (const o of input.observations)
    for (const [file, t] of Object.entries(o.dbfDiff.tables))
      for (const r of [
        ...t.inserted.map((x) => x.values),
        ...t.updated.flatMap((u) => u.changes.map((c) => ({ [c.field]: c.after }))),
      ])
        for (const [k, v] of Object.entries(r))
          if (NOISE.test(str(v)))
            evidence.push({ kind: 'observation', ref: o.id, text: `${file} ${k} = ${str(v)}` });
  return evidence.length
    ? [
        finding(
          input,
          'rounding',
          'low',
          {},
          {
            titleEn: 'Money is worked out with floating-point noise',
            titleUr: 'رقم کا حساب اعشاری شور کے ساتھ ہوتا ہے',
            en: 'The old app wrote values like 849.9999999: it works money out in floating point, so totals can be a paisa off.',
            ur: 'پرانی ایپ نے 849.9999999 جیسی رقمیں لکھیں: یہ رقم کا حساب اعشاری نمبروں میں کرتی ہے، اس لیے میزان ایک پیسہ غلط ہو سکتا ہے۔',
          },
          evidence.slice(0, 5),
        ),
      ]
    : [];
}

// ---- Security

const PASSWORD_FIELD = /^(PASS|PASSWD|PASSWORD|PWD|PIN|PASSCODE)$/;
const PASSWORD_PROMPT = /\b(PASSWORD|PASSWD|PASS ?CODE)\b/i;

/** Password fields stored readable in a data file, and a password the login screen takes. */
export function passwords(input: ExorcistInput): Finding[] {
  const out: Finding[] = [];
  for (const e of input.soul.entities)
    for (const f of e.fields.filter((x) => x.type === 'C' && PASSWORD_FIELD.test(x.name))) {
      const filled = recordsOf(input, e).filter((r) => str(r.values[f.name]) !== '').length;
      out.push(
        finding(
          input,
          'readable-password',
          'high',
          { entity: e, field: f.name },
          {
            titleEn: `Passwords are stored readable in ${e.file}`,
            titleUr: `${e.file} میں پاس ورڈ کھلے لکھے ہیں`,
            en: `${e.file} keeps ${f.name} as plain text: anyone who copies the file can read ${filled} password${filled === 1 ? '' : 's'}.`,
            ur: `${e.file} میں ${f.name} سادہ متن میں رکھا ہے: جو بھی فائل کاپی کرے وہ ${filled} پاس ورڈ پڑھ سکتا ہے۔`,
          },
          [
            {
              kind: 'record',
              ref: e.file,
              text: `${f.name}, C(${f.length}): ${filled} filled in (not shown here)`,
            },
          ],
        ),
      );
    }
  const login = input.observations.find(
    (o) =>
      o.screenBefore.text.some((l) => PASSWORD_PROMPT.test(l)) &&
      /^[^{}]+\{Enter\}$/.test(o.keys) &&
      !lines(o).some((l) => PASSWORD_PROMPT.test(l) || REFUSAL.test(l)),
  );
  if (login)
    out.push(
      finding(
        input,
        'hardcoded-password',
        'high',
        {},
        {
          titleEn: 'The login screen takes a fixed password',
          titleUr: 'لاگ اِن اسکرین ایک طے شدہ پاس ورڈ لیتی ہے',
          en: 'The old app let the Possessor in with a password it typed, the same for everyone: anyone who learns it can open the app.',
          ur: 'پرانی ایپ نے ایک ٹائپ کیے گئے پاس ورڈ سے اندر جانے دیا، جو سب کے لیے ایک ہی ہے: جسے بھی یہ معلوم ہو وہ ایپ کھول سکتا ہے۔',
        },
        [
          {
            kind: 'observation',
            ref: login.id,
            text: `A password of ${login.keys.length - '{Enter}'.length} characters (not shown here) opened the app`,
          },
        ],
      ),
    );
  return out;
}
