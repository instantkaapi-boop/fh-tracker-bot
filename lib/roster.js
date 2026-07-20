export const ROSTER = ['Fazil', 'Jishnu', 'Levin', 'Ajay'];

// Telegram usernames are stable and unique, unlike first names (e.g. "A").
// Prefer a username match; fall back to first-name matching for roster
// members who haven't given us their username yet.
const USERNAME_MAP = {
  ajayvu0: 'Ajay',
};

export function resolvePerson(ctx) {
  const username = (ctx.from?.username ?? '').trim().toLowerCase();
  if (username && USERNAME_MAP[username]) {
    return USERNAME_MAP[username];
  }
  const name = (ctx.from?.first_name ?? '').trim().toLowerCase();
  return ROSTER.find((p) => p.toLowerCase() === name) ?? null;
}
