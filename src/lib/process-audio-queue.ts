export async function drainAudioQueue(
  process: (limit: number) => Promise<{
    remaining: number;
    processed: number;
    failed: number;
  }>,
) {
  let remaining = 1;
  while (remaining > 0) {
    const result = await process(2);
    remaining = result.remaining;
    if (result.processed === 0 && result.failed === 0) break;
  }
}
