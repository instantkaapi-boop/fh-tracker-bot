// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" on every scheduled
// call. Manual triggers (curl) must send the same header. When CRON_SECRET is
// unset we fail open, which is only acceptable for local/manual testing.
export function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers['authorization'] === `Bearer ${secret}`;
}

// Read-only feeds that a calendar app or browser opens by URL can't send
// headers, so they use ?token=<DASHBOARD_TOKEN> instead. Separate secret
// from CRON_SECRET so a leaked calendar link can't trigger cron jobs.
export function hasDashboardToken(req) {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) return false;
  return req.query?.token === token;
}
