// pnpm --filter @afterlife/db migrate | migrate:down [steps] | seed   (reads DATABASE_URL)
import { createDb } from './client';
import { migrateDown, migrateUp } from './migrate';
import { seed } from './seed';

const [cmd, arg] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (see apps/api/.env.example).');
  process.exit(2);
}
const db = createDb(url, { max: 1 });
try {
  if (cmd === 'up') console.log('applied:', (await migrateUp(db.$client)).join(', ') || 'nothing');
  else if (cmd === 'down') {
    const steps = arg === undefined ? 1 : Number(arg);
    if (!Number.isInteger(steps) || steps < 1) throw new Error('steps must be a whole number >= 1');
    console.log('undone:', (await migrateDown(db.$client, steps)).join(', ') || 'nothing');
  } else if (cmd === 'seed') console.log('seeded rows:', await seed(db));
  else throw new Error(`Unknown command "${cmd}" (up, down [steps], seed)`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
