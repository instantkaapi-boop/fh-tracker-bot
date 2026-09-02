// Voice note → text via OpenAI's transcription endpoint. Returns null when
// OPENAI_API_KEY isn't configured so the bot can explain instead of failing.
export function transcriptionEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function transcribe(fileUrl) {
  if (!transcriptionEnabled()) return null;
  const audio = await fetch(fileUrl, { signal: AbortSignal.timeout(15000) });
  if (!audio.ok) throw new Error(`audio download failed: ${audio.status}`);
  const blob = await audio.blob();
  const form = new FormData();
  form.append('file', blob, 'voice.ogg');
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`transcription failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.text ?? '').trim();
}
