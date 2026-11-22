const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'booking-review-test-secret';
const bookingId = '507f1f77bcf86cd799439011';
let booking;
let saved = 0;
const dbPath = path.resolve(__dirname, '../dist/config/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { collections: {
  bookings: () => ({
    findOne: async () => ({ ...booking }),
    updateOne: async (query, update) => {
      assert.equal(query.customerEmail, 'customer@example.test');
      assert.equal(query.status, 'completed');
      assert.equal(query.paymentStatus, 'paid');
      assert.ok(query.$or.some(item => item.rating?.$exists === false));
      if (booking.rating) return { matchedCount: 0 };
      saved++;
      Object.assign(booking, update.$set);
      booking.statusHistory.push(update.$push.statusHistory);
      return { matchedCount: 1 };
    },
  }),
} } };
const routes = require('../dist/routes/bookingRoutes').default;

test('customer reviews require ownership, paid completion and one atomic submission', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', routes);
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/rating`;
  const send = (body, email = 'customer@example.test', role = 'customer') => fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ email, role }, process.env.JWT_SECRET)}` }, body: JSON.stringify(body),
  });
  const reset = () => { saved = 0; booking = { customerEmail: 'customer@example.test', status: 'completed', paymentStatus: 'paid', statusHistory: [] }; };
  reset();
  try {
    assert.equal((await fetch(url, { method: 'PATCH' })).status, 401);
    assert.equal((await send({ rating: 5, review: 'Great' }, 'other@example.test')).status, 403);
    assert.equal((await send({ rating: 5, review: 'Great' }, 'tech@example.test', 'technician')).status, 403);
    for (const rating of [0, 6, 2.5]) assert.equal((await send({ rating, review: 'Great' })).status, 400);
    assert.equal((await send({ rating: 5, review: '  ' })).status, 400);
    booking.paymentStatus = 'unpaid';
    assert.equal((await send({ rating: 5, review: 'Great' })).status, 409);
    reset();
    const response = await send({ rating: 5, review: '  Display works perfectly now.  ' });
    assert.equal(response.status, 200);
    assert.equal(booking.review, 'Display works perfectly now.');
    assert.equal(booking.rating, 5);
    assert.ok(booking.ratedAt instanceof Date);
    assert.equal(booking.status, 'completed');
    assert.equal(booking.statusHistory[0].status, 'rated');
    assert.equal(booking.statusHistory[0].changedAt, booking.ratedAt);
    assert.equal((await send({ rating: 1, review: 'Overwrite' })).status, 409);
    assert.equal(booking.rating, 5);
    assert.equal(saved, 1);
    reset();
    const concurrent = await Promise.all([send({ rating: 4, review: 'First submission' }), send({ rating: 5, review: 'Second submission' })]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    assert.equal(saved, 1);
    assert.equal(booking.statusHistory.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
