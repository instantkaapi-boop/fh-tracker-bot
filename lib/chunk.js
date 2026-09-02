export const TELEGRAM_MAX = 4096;

// Split on newlines so no chunk exceeds Telegram's 4096-char message limit.
// A single line longer than the limit is hard-cut.
export function chunkMessage(text, max = TELEGRAM_MAX) {
  if (text.length <= max) return [text];
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = line.length > max ? line.slice(0, max) : line;
  }
  if (current) chunks.push(current);
  return chunks;
}
