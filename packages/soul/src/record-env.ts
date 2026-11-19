// A DBF record as a rule sees it (review 41-50). The field's DBF type decides, not how its value
// looks: a D field "19991231" is a date, a C field "12" is the text "12", an N field "45.50" is
// a decimal. Field names become the rule's lower-case names (EXPIRY is medicine.expiry). A blank
// date or number is left out, so a rule that needs it says the value is missing.
import { D, dslDate, dslText, type DslDate, type DslText } from './dsl';
import type { Entity } from './ir';

type RawValue = string | number | boolean | null | undefined;
export type RecordEnv = Record<string, boolean | DslDate | DslText | InstanceType<typeof D>>;

export function recordEnv(entity: Entity, values: Record<string, RawValue>): RecordEnv {
  const out: RecordEnv = {};
  for (const f of entity.fields) {
    const v = values[f.name];
    if (v === null || v === undefined) continue;
    const name = f.name.toLowerCase();
    switch (f.type) {
      case 'C':
      case 'M':
        out[name] = dslText(String(v));
        break;
      case 'D':
        if (String(v).trim() !== '') out[name] = dslDate(String(v));
        break;
      case 'L':
        out[name] = v === true || v === 'T' || v === 'Y';
        break;
      case 'N':
      case 'F':
        // dBASE's overflow marker is not a number: the value is missing.
        if (/^-?\d+(\.\d+)?$/.test(String(v).trim())) out[name] = new D(String(v).trim());
        break;
    }
  }
  return out;
}
