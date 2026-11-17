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

/**
 * The Graveyard app with this id, or undefined. The Raise page 404s on undefined.
 * TODO(Prompt 40): uploaded projects get ids too; look them up in the API as well.
 */
export function findApp(id: string): GraveyardApp | undefined {
  return loadCatalog().apps.find((a) => a.id === id);
}
