// ZenQuotes' "today" endpoint returns the same quote all day, refreshed daily —
// a good fit for a once-a-morning post. No API key required.
export async function fetchDailyQuote() {
  try {
    const res = await fetch('https://zenquotes.io/api/today', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const { q, a } = data[0] ?? {};
    if (!q) return null;
    return `"${q}" — ${a || 'Unknown'}`;
  } catch (err) {
    console.error('quote fetch error:', err);
    return null;
  }
}
