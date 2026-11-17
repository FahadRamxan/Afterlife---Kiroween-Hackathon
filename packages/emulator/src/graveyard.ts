import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/, 'lower-case letters, digits and dashes');
const DosName = z
  .string()
  .regex(/^[A-Z0-9_-]{1,8}\.[A-Z0-9]{1,3}$/, 'an upper-case DOS 8.3 file name');

const Evidence = {
  id: Slug,
  /** Plain English. Hidden from the Crew; used only to score what they find (Prompt 56). */
  text: z.string().min(1),
  /** Scenarios in <app>/scenarios that demonstrate it. */
  scenarios: z.array(Slug).min(1),
};

const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((i) => i.id)).size === items.length;

/** samples/graveyard/<app>/manifest.json */
export const GraveyardManifest = z
  .object({
    id: Slug,
    name: z.string().min(1),
    version: z.string().min(1),
    /** Year the app was written. */
    born: z.number().int().min(1980).max(2010),
    /** Year it lost its developer: no updates, no source code since. */
    died: z.number().int().min(1980).max(2026),
    kind: z.enum(['pharmacy', 'school', 'kiryana']),
    place: z.string().min(1),
    /** The era story, 2 to 3 lines. */
    story: z
      .string()
      .min(1)
      .refine((s) => s.split('\n').length <= 3, 'at most 3 lines'),
    executable: DosName.refine((s) => /\.(EXE|COM)$/.test(s), 'an EXE or COM file'),
    dataFiles: z.array(DosName.refine((s) => s.endsWith('.DBF'), 'a .DBF file')).min(1),
    /** The DOS clock the app runs with in tests and demos (YYYY-MM-DD HH:MM:SS). */
    dosTime: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    /** Screen dump in fixtures/<app>/ used as the Graveyard preview. */
    preview: z.string().regex(/^[a-z0-9-]+\/[A-Z0-9_-]+\.SCR$/),
    knownRules: z
      .array(z.object(Evidence).strict())
      .min(1)
      .refine(uniqueIds, 'rule ids must be unique'),
    knownBugs: z
      .array(z.object({ ...Evidence, severity: z.enum(['low', 'medium', 'high']) }).strict())
      .min(1)
      .refine(uniqueIds, 'bug ids must be unique'),
  })
  .strict()
  .refine((m) => m.died >= m.born, { message: 'died must not be before born', path: ['died'] });

export type GraveyardManifestT = z.infer<typeof GraveyardManifest>;

/** What the Graveyard page may show: everything except the hidden rules and bugs. */
export type GraveyardEntry = Pick<
  GraveyardManifestT,
  'id' | 'name' | 'version' | 'born' | 'died' | 'kind' | 'place' | 'story' | 'executable'
> & { bundle: string; preview: string[] };

export function publicEntry(m: GraveyardManifestT, preview: string[]): GraveyardEntry {
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    born: m.born,
    died: m.died,
    kind: m.kind,
    place: m.place,
    story: m.story,
    executable: m.executable,
    bundle: `/graveyard/${m.id}.jsdos`,
    preview,
  };
}
