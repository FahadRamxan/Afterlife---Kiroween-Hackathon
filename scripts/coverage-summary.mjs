// Prints coverage/coverage-summary.json as a Markdown table (for the CI job summary and the README).
import { existsSync, readFileSync } from 'node:fs';

const file = 'coverage/coverage-summary.json';
if (!existsSync(file)) {
  console.log('No coverage report found.');
  process.exit(0);
}
const { total } = JSON.parse(readFileSync(file, 'utf8'));
const row = (k) => `| ${k} | ${total[k].pct}% | ${total[k].covered}/${total[k].total} |`;
console.log(
  [
    '## Coverage',
    '',
    '| Metric | % | Covered |',
    '| --- | --- | --- |',
    ...['lines', 'statements', 'functions', 'branches'].map(row),
  ].join('\n'),
);
