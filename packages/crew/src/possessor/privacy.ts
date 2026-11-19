// A real shop's customers are not the model's business (review 41-50). Before the Possessor shows
// the model a screen or a data file, it masks what is about a person: names in a table of people,
// and phones, addresses, CNICs and emails anywhere. The masked request is also what is logged, so
// the "Show your work" panel never shows them either.
import type { DataSample } from './values';

/** Fields about a person wherever they are. */
const ALWAYS = /PHONE|MOBILE|CELL|^TEL|_TEL|ADDR|CNIC|^NIC|EMAIL|CONTACT/;
/** Fields that are a person's only in a table of people (a medicine's NAME is stock). */
const IN_PEOPLE = /NAME|FATHER|GUARDIAN/;
const PEOPLE_FILE =
  /CUST|PARTY|PARTIES|STUDENT|PATIENT|PERSON|MEMBER|CLIENT|EMPLOY|STAFF|SUPPL|DEBTOR|CREDITOR|ACCOUNT/;

export function isPersonalField(file: string, field: string): boolean {
  const f = field.toUpperCase();
  if (ALWAYS.test(f)) return true;
  return IN_PEOPLE.test(f) && PEOPLE_FILE.test(file.toUpperCase());
}

/** What a masked value says it was. */
export function maskFor(field: string): string {
  const f = field.toUpperCase();
  if (/PHONE|MOBILE|CELL|TEL|CONTACT/.test(f)) return '[PHONE]';
  if (/ADDR/.test(f)) return '[ADDRESS]';
  if (/CNIC|NIC/.test(f)) return '[CNIC]';
  if (/EMAIL/.test(f)) return '[EMAIL]';
  return '[NAME]';
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A Pakistani mobile or landline number, and a CNIC, wherever they appear. */
const PHONE =
  /(?<![\d.])(?:\+92[- ]?|0)3\d{2}[- ]?\d{7}(?![\d.])|(?<![\d.])0\d{2,3}-\d{6,8}(?![\d.])/g;
const CNIC = /(?<!\d)\d{5}-\d{7}-\d(?!\d)/g;

/** Masks every personal value of the data files, and anything shaped like a phone or a CNIC. */
export function redactor(samples: DataSample[]): (s: string) => string {
  const known = new Map<string, string>();
  for (const s of samples)
    for (const [field, values] of Object.entries(s.personalByField ?? {}))
      for (const v of values) if (v.trim().length >= 3) known.set(v.trim(), maskFor(field));
  // Longest first, so "ALI RAZA KHAN" is masked before "ALI RAZA".
  const values = [...known.keys()].sort((a, b) => b.length - a.length);
  const re = values.length ? new RegExp(values.map(escape).join('|'), 'g') : null;
  return (s) => {
    let out = re ? s.replace(re, (m) => known.get(m) ?? '[NAME]') : s;
    out = out.replace(CNIC, '[CNIC]').replace(PHONE, '[PHONE]');
    return out;
  };
}
