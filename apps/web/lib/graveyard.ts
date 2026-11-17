import { GraveyardCatalog } from '@afterlife/emulator';
import raw from './graveyard-catalog.json';

export type Catalog = ReturnType<typeof GraveyardCatalog.parse>;
export type GraveyardApp = Catalog['apps'][number];

/** The public Graveyard catalogue (no hidden rules), validated so a bad publish fails the build. */
export function loadCatalog(): Catalog {
  return GraveyardCatalog.parse(raw);
}

export function storyLines(story: string): string[] {
  return story.split('\n').filter((l) => l.trim() !== '');
}
