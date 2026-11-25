// Unworkable rules (Prompt 81). A rule is kept only when the action can work it out: each value
// it reads is typed by the action's keys, given by another kept rule, a counter, or a field of a
// record that already exists (the medicine a bill line names, the party a payment updates).
// Barkat's learned `party.balance = ledger.balance` copied one unknown into another: the new
// ledger line's BALANCE is neither typed nor worked out, so the reborn app could only write blank.
import { macroFields, parseExpr, type Expr, type Rule, type Soul } from '@afterlife/soul';
import { ruleName } from './hypotheses';
/** The values an expression reads, lambda parameters left out. */
function reads(e: Expr, bound: Set<string> = new Set()): string[][] {
  switch (e.type) {
    case 'ref':
      return bound.has(e.path[0]!) ? [] : [e.path];
    case 'unary':
      return reads(e.arg, bound);
    case 'binary':
      return [...reads(e.left, bound), ...reads(e.right, bound)];
    case 'if':
      return [...reads(e.cond, bound), ...reads(e.then, bound), ...reads(e.else, bound)];
    case 'call':
      return e.args.flatMap((a) => reads(a, bound));
    case 'lambda':
      return reads(e.body, new Set([...bound, e.param]));
    default:
      return [];
  }
}
export function workableRules(
  rules: Rule[],
  draft: Pick<Soul, 'entities' | 'actions'>,
): { kept: Rule[]; rejected: { rule: string; reason: string }[] } {
  const byName = new Map(draft.entities.map((e) => [ruleName(e.id), e]));
  let kept = [...rules];
  const rejected: { rule: string; reason: string }[] = [];
  // Taking one rule out may leave another reading what it gave: until nothing changes.
  for (let changed = true; changed;) {
    changed = false;
    const given = new Set(kept.flatMap((r) => (r.target ? [r.target.toLowerCase()] : [])));
    for (const r of kept) {
      if (r.kind !== 'effect' && r.kind !== 'compute') continue;
      const entity = r.target ? byName.get(r.target.split('.')[0]!) : undefined;
      if (!entity) continue;
      let ast: Expr;
      try {
        ast = parseExpr(r.expression);
      } catch {
        continue;
      }
      // The actions that write the rule's target.
      const actions = draft.actions.filter((a) => a.effects.some((x) => x.entity === entity.id));
      const why = actions.flatMap((a) => {
        const typed = macroFields(a.keys);
        // Keys that type no field say nothing about what is typed (the Vessel's form does the same).
        if (!typed.record.length && !typed.line.length) return [];
        const inserted = new Set(a.effects.filter((x) => x.kind === 'insert').map((x) => x.entity));
        const lineEntity = a.effects
          .filter((x) => x.kind === 'insert')
          .map((x) => x.entity)
          .find(
            (id) =>
              typed.line.length &&
              typed.line.every((f) =>
                draft.entities.find((e) => e.id === id)?.fields.some((x) => x.name === f),
              ),
          );
        const unknown = reads(ast)
          .filter((p) => p.length === 2)
          .map(([n, field]) => ({
            name: n === 'item' && lineEntity ? ruleName(lineEntity) : n!,
            field: field!,
          }))
          .filter(({ name, field }) => {
            const e = byName.get(name);
            // Not a record of this action's (a record it only reads, or not an entity): it exists.
            if (!e || !inserted.has(e.id)) return false;
            const F = field.toUpperCase();
            const own = e.id === lineEntity ? typed.line : typed.record;
            if (own.includes(F)) return false;
            if (given.has(`${name}.${field}`.toLowerCase())) return false;
            if (e.counters.some((c) => c.field === F)) return false;
            return true;
          });
        return unknown.length
          ? [
              `${a.name} cannot work out ${unknown.map((u) => `${u.name}.${u.field}`).join(', ')}: it is not typed and no rule gives it`,
            ]
          : [];
      });
      if (why.length && why.length === actions.length) {
        kept = kept.filter((x) => x !== r);
        rejected.push({ rule: r.id, reason: why[0]! });
        changed = true;
        break;
      }
    }
  }
  return { kept, rejected };
}
