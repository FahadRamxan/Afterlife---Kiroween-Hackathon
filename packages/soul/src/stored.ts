// What a Soul looks like once it is stored as a project's version (Prompt 45): the API (a Soul
// sent to it) and the worker (a translated Soul, Prompt 46) store versions the same way.
import type { Soul } from './ir';
import { writeKiroSpec } from './spec-writer';

/** The Soul with its version number, its project and the version it was made from. */
export function numberSoul(
  soul: Soul,
  projectId: string,
  version: number,
  parentVersion: number | null,
): Soul {
  return {
    ...soul,
    version,
    provenance: {
      ...soul.provenance,
      projectId,
      ...(parentVersion !== null ? { parentVersion } : {}),
    },
  };
}

/** The Kiro spec's requirements.md, kept with each version. */
export function specRequirements(soul: Soul): string {
  const spec = writeKiroSpec(soul);
  return Object.entries(spec).find(([k]) => k.endsWith('requirements.md'))![1];
}
