export const ROSTER = ['Fazil', 'Jishnu', 'Levin', 'Ajay'];

// Telegram user IDs are permanent and unique, unlike usernames or first
// names (which people can change any time). Prefer an ID match; fall back
// to username, then first-name matching for roster members who haven't
// DM'd the bot yet to give us their ID.
const ID_MAP = {
  5638685781: 'Jishnu',
};

const USERNAME_MAP = {
  ajayvu0: 'Ajay',
};

export function resolvePerson(ctx) {
  const id = ctx.from?.id;
  if (id && ID_MAP[id]) {
    return ID_MAP[id];
  }
  const username = (ctx.from?.username ?? '').trim().toLowerCase();
  if (username && USERNAME_MAP[username]) {
    return USERNAME_MAP[username];
  }
  const name = (ctx.from?.first_name ?? '').trim().toLowerCase();
  return ROSTER.find((p) => p.toLowerCase() === name) ?? null;
}
