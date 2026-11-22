import { Router } from 'express';
import { collections } from '../config/db';
import { verifyToken } from '../middleware/auth';

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
    const [totalServices, approvedServices, pendingRequests] = await Promise.all([
      collections.services().countDocuments({ technicianEmail: email }),
      collections.services().countDocuments({ technicianEmail: email, approvalStatus: 'approved' }),
      collections.bookings().countDocuments({ technicianEmail: email, status: 'requested' }),
    ]);
    return res.send({ totalServices, approvedServices, pendingRequests });
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

export default router;
