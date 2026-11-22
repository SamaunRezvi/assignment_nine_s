import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { collections } from '../config/db';
import { verifyToken, verifyAdmin } from '../middleware/auth';

const router = Router();

const BOOKING_STATUSES = ['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled'];

router.use(verifyToken, verifyAdmin);

// GET /api/admin/users - optional search by name or email
router.get('/users', async (req, res) => {
  const { search } = req.query as Record<string, string>;

  const query: Record<string, unknown> = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await collections.users().find(query).sort({ createdAt: -1 }).toArray();
  res.send(users);
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', async (req, res) => {
  const id = req.params.id as string;
  const { role } = req.body;

  if (!['customer', 'technician', 'admin'].includes(role)) {
    return res.status(400).send({ message: 'Invalid role' });
  }

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'User not found' });
  }

  const target = await collections.users().findOne({ _id: new ObjectId(id) });

  if (!target) {
    return res.status(404).send({ message: 'User not found' });
  }

  if (target.email === req.user!.email) {
    return res.status(403).send({ message: 'You cannot change your own role' });
  }

  await collections.users().updateOne({ _id: new ObjectId(id) }, { $set: { role } });
  res.send({ message: 'Role updated' });
});

// PATCH /api/admin/services/:id/approval
router.patch('/services/:id/approval', async (req, res) => {
  const id = req.params.id as string;
  const { approvalStatus } = req.body;

  if (!['approved', 'rejected'].includes(approvalStatus)) {
    return res.status(400).send({ message: 'Invalid approval status' });
  }

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Service not found' });
  }

  await collections.services().updateOne({ _id: new ObjectId(id) }, { $set: { approvalStatus } });
  res.send({ message: 'Service approval updated' });
});

// GET /api/admin/services - all services, optional approvalStatus filter
router.get('/services', async (req, res) => {
  const { approvalStatus } = req.query as Record<string, string>;

  if (approvalStatus && !['pending', 'approved', 'rejected'].includes(approvalStatus)) {
    return res.status(400).send({ message: 'Invalid approval status filter' });
  }

  const query: Record<string, unknown> = {};
  if (approvalStatus) query.approvalStatus = approvalStatus;

  const services = await collections.services().find(query).sort({ createdAt: -1 }).toArray();
  res.send(services);
});

// GET /api/admin/bookings - all bookings, optional status filter and search
router.get('/bookings', async (req, res) => {
  const { status, search } = req.query as Record<string, string>;

  if (status && status !== 'all' && !BOOKING_STATUSES.includes(status)) {
    return res.status(400).send({ message: 'Invalid status filter' });
  }

  const query: Record<string, unknown> = {};
  if (status && status !== 'all') query.status = status;
  if (search) {
    query.$or = [
      { customerName: { $regex: search, $options: 'i' } },
      { technicianName: { $regex: search, $options: 'i' } },
      { serviceTitle: { $regex: search, $options: 'i' } },
    ];
  }

  const bookings = await collections.bookings().find(query).sort({ createdAt: -1 }).toArray();
  res.send(bookings);
});

// GET /api/admin/payments - all payments + total revenue, optional search
router.get('/payments', async (req, res) => {
  const { search } = req.query as Record<string, string>;

  const query: Record<string, unknown> = {};
  if (search) {
    query.$or = [
      { customerName: { $regex: search, $options: 'i' } },
      { technicianName: { $regex: search, $options: 'i' } },
      { serviceTitle: { $regex: search, $options: 'i' } },
      { transactionId: { $regex: search, $options: 'i' } },
    ];
  }

  const payments = await collections.payments().find(query).sort({ paidAt: -1 }).toArray();
  const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  res.send({ payments, totalRevenue });
});

// GET /api/admin/stats - overview stats cards
router.get('/stats', async (_req, res) => {
  const [totalUsers, totalTechnicians, pendingServices] = await Promise.all([
    collections.users().countDocuments(),
    collections.users().countDocuments({ role: 'technician' }),
    collections.services().countDocuments({ approvalStatus: 'pending' }),
  ]);

  res.send({ totalUsers, totalTechnicians, pendingServices });
});

// GET /api/admin/analytics - revenue over time, bookings by category, technician leaderboard
router.get('/analytics', async (_req, res) => {
  const [revenueByDay, bookingsByCategory, technicianLeaderboard] = await Promise.all([
    collections
      .payments()
      .aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
            revenue: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', revenue: 1 } },
      ])
      .toArray(),
    collections
      .bookings()
      .aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, category: '$_id', count: 1 } },
      ])
      .toArray(),
    collections
      .bookings()
      .aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$technicianEmail',
            technicianName: { $first: '$technicianName' },
            completedJobs: { $sum: 1 },
          },
        },
        { $sort: { completedJobs: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, technicianEmail: '$_id', technicianName: 1, completedJobs: 1 } },
      ])
      .toArray(),
  ]);

  const ratingByTechnician = await collections
    .bookings()
    .aggregate([
      { $match: { rating: { $exists: true } } },
      { $group: { _id: '$technicianEmail', averageRating: { $avg: '$rating' } } },
    ])
    .toArray();

  const ratingMap = new Map(ratingByTechnician.map((r) => [r._id, Math.round(r.averageRating * 10) / 10]));
  const leaderboard = technicianLeaderboard.map((t) => ({
    ...t,
    averageRating: ratingMap.get(t.technicianEmail) ?? null,
  }));

  res.send({ revenueByDay, bookingsByCategory, technicianLeaderboard: leaderboard });
});

export default router;
