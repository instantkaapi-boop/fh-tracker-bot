export const ROSTER = ['Fazil', 'Jishnu', 'Levin', 'Ajay', 'Shamil'];

// Telegram user IDs are permanent and unique, unlike usernames or first
// names (which people can change any time). Prefer an ID match; fall back
// to username, then first-name matching for roster members who haven't
// DM'd the bot yet to give us their ID (send /whoami to the bot).
const ID_MAP = {
  5638685781: 'Jishnu',
  7724156060: 'Levin',
  7012867841: 'Fazil',
  8839496591: 'Ajay',
  1459551455: 'Shamil',
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

// Resolve a name typed as a command argument ("/leave Jishnu full") to a
// roster member. Full first name only, case-insensitive. Returns null if it
// doesn't match anyone — callers treat that as "no target given".
export function resolveRosterName(token) {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  return ROSTER.find((p) => p.toLowerCase() === t) ?? null;
}

// A private chat's id equals the user's id, so ID_MAP doubles as the DM
// address book. Returns null for people whose id we don't have yet.
export function chatIdFor(person) {
  const entry = Object.entries(ID_MAP).find(([, p]) => p === person);
  return entry ? Number(entry[0]) : null;
}

export const ADMIN_PERSON = 'Ajay';
