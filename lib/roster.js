export const ROSTER = ['Fazil', 'Jishnu', 'Levin'];

// Matches a Telegram sender's first name against the known roster.
// Keeps setup simple (no per-user ID mapping) since the roster is small and fixed.
export function resolvePerson(ctx) {
  const name = (ctx.from?.first_name ?? '').trim().toLowerCase();
  return ROSTER.find((p) => p.toLowerCase() === name) ?? null;
}
