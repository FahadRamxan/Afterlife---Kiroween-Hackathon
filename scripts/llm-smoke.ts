// pnpm llm:smoke (Prompt 80a): one tiny real call to the Claude API, to check the key and the model
// before a raise spends tokens. Reads apps/worker/.env (the package script loads it). Without
// ANTHROPIC_API_KEY it says it skipped and exits 0. The key is never printed.
import { llmClientFrom, textOf } from '@afterlife/crew';
async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.log('llm:smoke skipped: no ANTHROPIC_API_KEY (add it to apps/worker/.env)');
    return;
  }
  const client = llmClientFrom({ ...process.env, LLM_PROVIDER: 'anthropic' })!;
  const start = Date.now();
  const r = await client.converse({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with one word: ready' }] }],
    // Thinking is on for Sonnet 5.5, so leave it room before the one word.
    maxTokens: 2048,
  });
  console.log(
    `llm:smoke ok: ${client.provider} ${client.model} answered "${textOf(r).trim()}" ` +
      `(${r.stopReason}, ${r.usage.inputTokens} in, ${r.usage.outputTokens} out, ${Date.now() - start} ms)`,
  );
}
main().catch((e: unknown) => {
  // The SDK's error says what went wrong (401 bad key, 404 no such model); it never holds the key.
  console.error(`llm:smoke FAILED: ${(e as Error).message}`);
  process.exit(1);
});
