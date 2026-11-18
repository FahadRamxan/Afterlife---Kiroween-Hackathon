import {
  Button,
  Card,
  CertificateFrame,
  CRTFrame,
  CrtScreen,
  DbfDiffView,
  DbfTable,
  DiffBadge,
  GhostCursor,
  ProgressCandle,
  Tombstone,
  colors,
} from '@afterlife/ui';
import type { ReactNode } from 'react';
import {
  shifaBillScreen,
  shifaMedicine,
  shifaMenuDecoded,
  shifaStockDiff,
} from '../../lib/design-samples';
import { findApp } from '../../lib/graveyard';

export const metadata = { title: 'Design system · Afterlife' };

function Section({
  id,
  title,
  meaning,
  children,
}: {
  id: string;
  title: string;
  meaning: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={`ds-${id}`} aria-labelledby={`ds-${id}-title`} className="space-y-4">
      <div>
        <h2 id={`ds-${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        <p className="text-sm text-bone/75">{meaning}</p>
      </div>
      {children}
    </section>
  );
}

const SHIFA_MENU = [
  '  SHIFA MEDICAL STORE  v2.3        (C) 1998',
  ' ─────────────────────────────────────────',
  '   1  New Bill',
  '   2  Stock',
  '   3  Customers',
  '   4  Daily Report',
  '   5  Exit',
  '',
  '   Choice: _',
].join('\n');

export default async function DesignPage() {
  const medicine = shifaMedicine();
  const stock = shifaStockDiff();
  const decoded = await shifaMenuDecoded();
  const bill = shifaBillScreen();
  // The demos use the real catalogue entry, so their years and place match the Graveyard.
  const shifa = findApp('shifa')!;
  const shifaTitle = `${shifa.name} v${shifa.version}`;
  return (
    // This page is English only. lang/dir keep it readable when the site is in Urdu (right to
    // left), where "A .DBF file as it really is." became ".A .DBF file as it really is".
    <main lang="en" dir="ltr" className="mx-auto max-w-5xl space-y-14 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">Haunted Ledger</h1>
        <p className="mt-2 text-bone/75">
          The Afterlife design system. Every spooky effect also means something.
        </p>
      </header>

      <Section id="palette" title="Palette" meaning="Each colour has one job.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(colors).map(([name, hex]) => (
            <li key={name} className="flex items-center gap-3">
              <span
                className="size-10 rounded-md border border-bone/20"
                style={{ background: hex }}
              />
              <span className="font-mono text-sm">
                {name} <span className="text-bone/70">{hex}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="Typography"
        meaning="Mono for anything from the old app, Inter for the UI, Nastaliq for Urdu."
      >
        <p className="font-mono">IBM Plex Mono · MEDICINE.DBF · 17% GST</p>
        <p className="font-sans">Inter · Raise a dead app</p>
        <p lang="ur" dir="rtl" className="font-urdu text-xl leading-[2.2]">
          شفا میڈیکل سٹور
        </p>
      </Section>

      <Section id="button" title="Button" meaning="Teal moves forward, red changes old behaviour.">
        <div className="flex flex-wrap gap-3">
          <Button>Raise</Button>
          <Button variant="secondary">How it works</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">Fix</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section id="card" title="Card" meaning="A neutral container.">
        <Card className="max-w-sm">
          <h3 className="font-semibold">12 rules exhumed</h3>
          <p className="text-sm text-bone/75">from 143 observations</p>
        </Card>
      </Section>

      <Section id="tombstone" title="Tombstone" meaning="A dead app that can be raised.">
        <Tombstone
          className="max-w-xs"
          name={shifaTitle}
          born={shifa.born}
          died={shifa.died}
          actions={<Button>Raise</Button>}
        >
          Billing and stock for a pharmacy in {shifa.place}.
        </Tombstone>
      </Section>

      <Section
        id="crt"
        title="CRTFrame and GhostCursor"
        meaning="Scanlines mean the real old app is running. The ghost cursor shows where the agent is typing."
      >
        <CRTFrame label="Shifa Medical Store, 1998, running live" className="max-w-xl">
          <div className="relative leading-[1.5em] [--cell-h:1.5em]">
            {SHIFA_MENU}
            <GhostCursor col={11} row={8} />
          </div>
        </CRTFrame>
      </Section>

      <Section
        id="crtscreen"
        title="CrtScreen"
        meaning="The old app's real text screen in its own DOS colours. Ectoplasm ring: the field the agent is working on. Candle outline: data that just changed (it pulses, unless motion is reduced)."
      >
        <CrtScreen
          className="max-w-3xl"
          grid={bill.grid}
          label="Shifa Medical Store, 1998, recorded run"
          highlight={bill.highlight}
          ghost={bill.ghost}
          changed={bill.changed}
        />
      </Section>

      <Section
        id="diff"
        title="DiffBadge"
        meaning="Teal = new data, red = removed or different, amber = changed."
      >
        <div className="flex flex-wrap gap-3">
          <DiffBadge kind="inserted" count={3} />
          <DiffBadge kind="deleted" count={1} />
          <DiffBadge kind="changed" count={2} />
          <DiffBadge kind="same" />
        </div>
      </Section>

      <Section
        id="dbftable"
        title="DbfTable"
        meaning="A .DBF file as it really is: field types in the header, every record, deleted ones struck. Arrow keys, Home/End, PageUp/PageDown, Ctrl+Home/End."
      >
        <DbfTable
          caption="MEDICINE.DBF (Shifa, 40 medicines)"
          fields={medicine.fields}
          records={medicine.records}
        />
      </Section>

      <Section
        id="dbfdiff"
        title="DbfDiffView"
        meaning="What the old app changed: inserted rows teal, deleted rows red and struck, changed cells amber with old → new."
      >
        <DbfDiffView
          caption="MEDICINE.DBF changes"
          before={stock.before}
          after={stock.after}
          diff={stock.diff}
          height={260}
        />
      </Section>

      <Section
        id="decoder"
        title="Screen decoder"
        meaning="How Afterlife reads the old app: every 8x16 cell of the emulator's frame is matched against the VGA font (no OCR), then the screen's menu, fields and keys are worked out from its text and colours."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <figure className="min-w-0 space-y-2">
            {/* A plain img: a small fixed-size data URL, nothing for next/image to optimise. */}
            <img
              src={decoded.src}
              width={decoded.width}
              height={decoded.height}
              alt="js-dos frame of the Shifa main menu, recorded run"
              className="h-[300px] w-[480px] max-w-full rounded border border-bone/15 [image-rendering:pixelated]"
            />
            <figcaption className="text-xs text-bone/75">
              Recorded run: a js-dos frame, {decoded.width}x{decoded.height} pixels.
            </figcaption>
          </figure>
          <figure className="min-w-0 space-y-2">
            <pre
              // Scrolls sideways on narrow screens, so it must be reachable by keyboard.
              tabIndex={0}
              aria-label="Decoded text"
              className="overflow-x-auto rounded border border-bone/15 bg-black p-3 font-mono text-[10px] leading-[12px] text-phosphor"
            >
              {decoded.text.join('\n')}
            </pre>
            <figcaption className="font-mono text-xs text-bone/75" data-testid="decoder-stats">
              {decoded.cells.toLocaleString('en')} cells read, {decoded.unknown} unknown
              {decoded.cursor
                ? `, cursor at row ${decoded.cursor.row + 1}, column ${decoded.cursor.col + 1}`
                : ''}
            </figcaption>
          </figure>
        </div>
        <dl
          data-testid="screen-model"
          className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]"
        >
          <dt className="text-bone/75">Screen</dt>
          <dd className="font-mono text-phosphor">{decoded.model.title?.name}</dd>
          <dt className="text-bone/75">Menu ({decoded.model.menu?.kind})</dt>
          <dd className="font-mono text-phosphor">
            {decoded.model.menu?.items.map((i) => `${i.key} ${i.label}`).join(' · ')}
          </dd>
          <dt className="text-bone/75">Fields</dt>
          <dd className="font-mono">
            {/* Phosphor is only for the old app's own text; our notes about it are bone. */}
            {decoded.model.fields.map((f) => (
              <span key={`${f.row}-${f.col}`}>
                <span className="text-phosphor">{f.label}:</span>{' '}
                <span className="text-bone/75">
                  ({f.kind}
                  {f.focused ? ', cursor here' : ''})
                </span>
              </span>
            ))}
          </dd>
          <dt className="text-bone/75">Fingerprint</dt>
          <dd className="font-mono text-bone" data-testid="screen-fingerprint">
            {decoded.fingerprint}
          </dd>
          <dt className="text-bone/75">Keys</dt>
          <dd className="font-mono text-phosphor">
            {decoded.model.status?.hints.map((h) => `${h.key} ${h.action}`).join(' · ')}
          </dd>
        </dl>
      </Section>

      <Section
        id="candle"
        title="ProgressCandle"
        meaning="The candle burns down as the work completes."
      >
        <div className="flex gap-10">
          <ProgressCandle value={0} max={2000} label="Proof cases, not started" />
          <ProgressCandle value={1284} max={2000} label="Proof cases" />
          <ProgressCandle value={2000} max={2000} label="Proof cases, done" />
        </div>
      </Section>

      <Section id="certificate" title="CertificateFrame" meaning="The signed proof of rebirth.">
        <CertificateFrame title="Certificate of Rebirth" className="max-w-xl">
          <p className="text-center">{shifaTitle}</p>
          <p className="text-center font-mono text-sm">Died {shifa.died} · Reborn 2026</p>
          <p className="mt-4 text-center font-mono text-sm">2,000 cases · 0 differences</p>
        </CertificateFrame>
      </Section>
    </main>
  );
}
