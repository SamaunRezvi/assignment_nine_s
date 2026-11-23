import { Router } from 'express';
import { collections } from '../config/db';
import { verifyToken, verifyTechnician } from '../middleware/auth';

const router = Router();

// GET /api/users/me - any logged-in user, own profile only
router.get('/me', verifyToken, async (req, res) => {
  const user = await collections.users().findOne({ email: req.user!.email });

  if (!user) {
    return res.status(404).send({ message: 'User not found' });
  }

  res.send(user);
});

// GET /api/users/stats - customer/technician overview stats, scoped to own data
router.get('/stats', verifyToken, async (req, res) => {
  const { email, role } = req.user!;

  if (role === 'customer') {
    const [totalRequests, activeJobs, completedJobs] = await Promise.all([
      collections.bookings().countDocuments({ customerEmail: email }),
      collections.bookings().countDocuments({ customerEmail: email, status: { $in: ['requested', 'accepted', 'in-progress'] } }),
      collections.bookings().countDocuments({ customerEmail: email, status: 'completed' }),
    ]);
    return res.send({ totalRequests, activeJobs, completedJobs });
  }

  if (role === 'technician') {
    const [totalServices, approvedServices, pendingRequests, ratingSummary] = await Promise.all([
      collections.services().countDocuments({ technicianEmail: email }),
      collections.services().countDocuments({ technicianEmail: email, approvalStatus: 'approved' }),
      collections.bookings().countDocuments({ technicianEmail: email, status: 'requested' }),
      collections
        .bookings()
        .aggregate([
          { $match: { technicianEmail: email, rating: { $exists: true } } },
          { $group: { _id: null, averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const summary = ratingSummary[0];
    const averageRating = summary ? Math.round(summary.averageRating * 10) / 10 : null;
    const reviewCount = summary?.reviewCount ?? 0;

    return res.send({ totalServices, approvedServices, pendingRequests, averageRating, reviewCount });
  }

  res.send({});
});

// PATCH /api/users/profile - any logged-in user, own profile only
router.patch('/profile', verifyToken, async (req, res) => {
  const { name, phone, area, bio, image } = req.body;

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (phone !== undefined) update.phone = phone;
  if (area !== undefined) update.area = area;
  if (bio !== undefined) update.bio = bio;
  if (image !== undefined) update.image = image;

  await collections.users().updateOne({ email: req.user!.email }, { $set: update });
  const updated = await collections.users().findOne({ email: req.user!.email });
  res.send(updated);
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/users/availability - technician only, own account only
router.get('/availability', verifyToken, verifyTechnician, async (req, res) => {
  const user = await collections.users().findOne({ email: req.user!.email });
  res.send({ unavailableDates: user?.unavailableDates ?? [] });
});

// PATCH /api/users/availability - technician only, own account only
router.patch('/availability', verifyToken, verifyTechnician, async (req, res) => {
  const { date, action } = req.body;

  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    return res.status(400).send({ message: 'Date must be in YYYY-MM-DD format' });
  }

  if (action !== 'block' && action !== 'unblock') {
    return res.status(400).send({ message: 'Action must be block or unblock' });
  }

  const update = action === 'block'
    ? { $addToSet: { unavailableDates: date } }
    : { $pull: { unavailableDates: date } };

  await collections.users().updateOne({ email: req.user!.email }, update as never);
  const user = await collections.users().findOne({ email: req.user!.email });
  res.send({ unavailableDates: user?.unavailableDates ?? [] });
});

const SHIFTS = ['morning', 'noon', 'evening', 'night'];

// GET /api/users/shift-locks - technician only, own account only
router.get('/shift-locks', verifyToken, verifyTechnician, async (req, res) => {
  const user = await collections.users().findOne({ email: req.user!.email });
  res.send({ lockedShifts: user?.lockedShifts ?? [] });
});

// PATCH /api/users/shift-lock - technician only, own account only
router.patch('/shift-lock', verifyToken, verifyTechnician, async (req, res) => {
  const { date, shift, action } = req.body;

  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    return res.status(400).send({ message: 'Date must be in YYYY-MM-DD format' });
  }

  if (!SHIFTS.includes(shift)) {
    return res.status(400).send({ message: 'Shift must be morning, noon, evening or night' });
  }

  if (action !== 'lock' && action !== 'unlock') {
    return res.status(400).send({ message: 'Action must be lock or unlock' });
  }

  const entry = { date, shift };
  const update = action === 'lock'
    ? { $addToSet: { lockedShifts: entry } }
    : { $pull: { lockedShifts: entry } };

  await collections.users().updateOne({ email: req.user!.email }, update as never);
  const user = await collections.users().findOne({ email: req.user!.email });
  res.send({ lockedShifts: user?.lockedShifts ?? [] });
});

export default router;
