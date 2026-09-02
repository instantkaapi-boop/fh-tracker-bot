import { isAuthorized } from './auth.js';
import { alertAdmin } from './alert.js';
import { isSundayIST } from './logic.js';

// Wraps a cron job body with the boilerplate every endpoint shares: auth,
// optional Sunday skip, required env check, try/catch with admin alert.
export function cronHandler(name, { skipSunday = false, requireEnv = [] } = {}, run) {
  const handler = async (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    if (skipSunday && isSundayIST()) {
      res.status(200).json({ ok: true, skipped: 'sunday' });
      return;
    }
    for (const key of requireEnv) {
      if (!process.env[key]) {
        res.status(500).json({ ok: false, error: `${key} not set` });
        return;
      }
    }
    try {
      const result = await run(req);
      res.status(200).json({ ok: true, ...(result ?? {}) });
    } catch (err) {
      console.error(`${name} error:`, err);
      await alertAdmin(name, err);
      res.status(500).json({ ok: false, error: 'internal error' });
    }
  };
  return handler;
}
