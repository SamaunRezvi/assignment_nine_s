const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'notification-test-secret';
const profile = { notificationsEnabled: true, notificationsReadAt: new Date('2026-01-01') };
let rows = [];
let calls = 0;
const queries = [];
const writes = [];
const dbPath = path.resolve(__dirname, '../dist/config/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { collections: {
  users: () => ({
    findOne: async query => { queries.push(query); return profile; },
    updateOne: async (query, update) => {
      writes.push({ query, update });
      if (update.$set) Object.assign(profile, update.$set);
      if (update.$max && (!profile.notificationsReadAt || profile.notificationsReadAt < update.$max.notificationsReadAt)) profile.notificationsReadAt = update.$max.notificationsReadAt;
    },
  }),
  bookings: () => ({ aggregate: pipeline => {
    calls++;
    queries.push(pipeline[0].$match);
    assert.ok(pipeline.some(stage => stage.$unwind === '$statusHistory'));
    return { toArray: async () => [{ items: rows, unread: [{ count: rows.filter(row => row.createdAt > profile.notificationsReadAt).length }] }] };
  } }),
} } };
const { notificationSnapshot } = require('../dist/lib/notifications');
const routes = require('../dist/routes/notificationRoutes').default;

test('notifications: role scopes, authentication, preferences, read state, live updates and reconnect', async () => {
  for (const role of ['customer', 'technician', 'admin']) {
    queries.length = 0;
    rows = [{ bookingId: 'booking', status: 'requested', serviceTitle: 'Phone repair', createdAt: new Date() }];
    const snapshot = await notificationSnapshot({ email: `${role}@example.test`, role });
    assert.deepEqual(queries[1], role === 'admin' ? {} : { [role === 'customer' ? 'customerEmail' : 'technicianEmail']: `${role}@example.test` });
    assert.equal(snapshot.items[0].title, 'New repair request');
    assert.ok(snapshot.items[0].href.startsWith(`/dashboard/${role}/`));
    assert.equal(snapshot.unreadCount, 1);
    rows = [{ bookingId: 'reviewed-booking', status: 'rated', serviceTitle: 'Display repair', customerName: 'Tanvir Ahmed', rating: 5, review: 'Great work', createdAt: new Date() }];
    const reviewed = await notificationSnapshot({ email: `${role}@example.test`, role });
    assert.equal(reviewed.items[0].title, 'New customer feedback');
    assert.equal(reviewed.items[0].message, 'Tanvir Ahmed rated Display repair 5/5: Great work');
    assert.ok(reviewed.items[0].href.startsWith(`/dashboard/${role}/`));
  }

  const app = express();
  app.use(express.json());
  app.use('/api/notifications', routes);
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}/api/notifications`;
  const token = jwt.sign({ email: 'tech@example.test', role: 'technician' }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const patch = (path, body) => fetch(base + path, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const controller = new AbortController();
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base + '/stream?token=' + token)).status, 401);
    assert.equal((await patch('/preferences', { enabled: 'yes' })).status, 400);
    assert.equal((await (await patch('/preferences', { enabled: false })).json()).enabled, false);
    assert.deepEqual(writes.at(-1).query, { email: 'tech@example.test' });
    assert.equal((await (await patch('/preferences', { enabled: true })).json()).enabled, true);
    assert.equal((await patch('/read', { readAt: 'invalid' })).status, 400);
    assert.equal((await patch('/read', { readAt: '2099-01-01' })).status, 400);
    const timestamp = rows[0].createdAt.toISOString();
    assert.equal((await (await patch('/read', { readAt: timestamp })).json()).unreadCount, 0);
    await patch('/read', { readAt: '2020-01-01' });
    assert.equal(profile.notificationsReadAt.toISOString(), timestamp, 'Read state cannot move backwards');

    const response = await fetch(base + '/stream', { headers, signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: notifications/);
    rows = [{ bookingId: 'new-booking', status: 'accepted', serviceTitle: 'Updated repair', createdAt: new Date(Date.now() + 1) }];
    const frame = new TextDecoder().decode((await reader.read()).value);
    assert.match(frame, /Request accepted/);
    assert.match(frame, /Updated repair/);
    controller.abort();
    await reader.cancel().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 100));
    const afterClose = calls;
    await new Promise(resolve => setTimeout(resolve, 3_100));
    assert.equal(calls, afterClose, 'Disconnected streams stop querying');
    const reconnect = await fetch(base, { headers });
    assert.equal((await reconnect.json()).items[0].message, 'Updated repair', 'Missed events survive reconnects');
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
