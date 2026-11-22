// The keys of a macro in the steps a person types them in (review of 51-60, finding 3; moved here
// from the worker for the Oracle in Prompt 68): the text, then the key that ends it. Typed one step
// at a time, waiting for the screen between, a slow DOS program loses no keys.
import { parseKeys, printKeys } from './keys';

export function keySteps(keys: string): string[] {
  const out: string[] = [];
  let text: ReturnType<typeof parseKeys> = [];
  for (const s of parseKeys(keys)) {
    if (s.kind === 'text') text.push(s);
    else {
      out.push(printKeys([...text, s]));
      text = [];
    }
  }
  if (text.length) out.push(printKeys(text));
  return out;
}
