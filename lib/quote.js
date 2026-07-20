// Fallback pool if ZenQuotes is slow/down — picked by day-of-year so it still
// rotates daily without ever leaving the brief without a quote.
const FALLBACK_QUOTES = [
  '"The secret of getting ahead is getting started." — Mark Twain',
  '"Discipline is choosing between what you want now and what you want most." — Abraham Lincoln',
  '"Well done is better than well said." — Benjamin Franklin',
  '"Action is the foundational key to all success." — Pablo Picasso',
  '"Small daily improvements are the key to staggering long-term results." — Robin Sharma',
  '"You don\'t have to be great to start, but you have to start to be great." — Zig Ziglar',
  '"Focus on being productive instead of busy." — Tim Ferriss',
  '"The way to get started is to quit talking and begin doing." — Walt Disney',
  '"Quality is not an act, it is a habit." — Aristotle',
  '"Do the hard jobs first. The easy jobs will take care of themselves." — Dale Carnegie',
];

function fallbackQuote() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000,
  );
  return FALLBACK_QUOTES[dayOfYear % FALLBACK_QUOTES.length];
}

// ZenQuotes' "today" endpoint returns the same quote all day, refreshed daily —
// a good fit for a once-a-morning post. No API key required. Falls back to a
// local rotating quote if the API is slow or down, so the brief never ships
// without one.
export async function fetchDailyQuote() {
  try {
    const res = await fetch('https://zenquotes.io/api/today', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const { q, a } = data[0] ?? {};
    if (!q) return fallbackQuote();
    return `"${q}" — ${a || 'Unknown'}`;
  } catch (err) {
    console.error('quote fetch error, using fallback:', err);
    return fallbackQuote();
  }
}
