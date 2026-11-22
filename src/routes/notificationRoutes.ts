import { Router } from 'express';
import { collections } from '../config/db';
import { verifyToken } from '../middleware/auth';
import { notificationSnapshot } from '../lib/notifications';

const router = Router();
router.use(verifyToken);

router.get('/', async (req, res) => {
  res.send(await notificationSnapshot(req.user!));
});

router.patch('/preferences', async (req, res) => {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).send({ message: 'Enabled must be true or false' });
  await collections.users().updateOne({ email: req.user!.email }, { $set: { notificationsEnabled: req.body.enabled } });
  res.send(await notificationSnapshot(req.user!));
});

router.patch('/read', async (req, res) => {
  const readAt = typeof req.body.readAt === 'string' ? new Date(req.body.readAt) : new Date(NaN);
  if (!Number.isFinite(readAt.getTime()) || readAt.getTime() > Date.now()) {
    return res.status(400).send({ message: 'A valid notification timestamp is required' });
  }
  await collections.users().updateOne({ email: req.user!.email }, { $max: { notificationsReadAt: readAt } });
  res.send(await notificationSnapshot(req.user!));
});

router.get('/stream', async (req, res) => {
  const initial = await notificationSnapshot(req.user!);
  res.set({
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  let closed = false;
  let previous = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = setTimeout(() => res.end(), 55_000);
  res.on('close', () => {
    closed = true;
    clearTimeout(timer);
    clearTimeout(expiry);
  });
  function send(snapshot: typeof initial) {
    if (closed) return;
    const data = JSON.stringify(snapshot);
    const writable = res.write(data === previous ? ': heartbeat\n\n' : `event: notifications\ndata: ${data}\n\n`);
    previous = data;
    if (!writable || !snapshot.enabled) res.end();
  }
  async function tick() {
    try {
      const snapshot = await notificationSnapshot(req.user!);
      send(snapshot);
      if (!closed && !res.writableEnded) timer = setTimeout(tick, 3_000);
    } catch {
      res.end(); // Clients reconnect and recover from the persisted history.
    }
  }
  send(initial);
  if (!res.writableEnded) timer = setTimeout(tick, 3_000);
});

export default router;
