// For env-file.test.ts: prints which model the worker's settings give, from its environment only.
import { llmClientFrom } from '@afterlife/crew';
const c = llmClientFrom(process.env);
console.log(c ? `${c.provider} ${c.model}` : 'none');
