import { Router } from 'express';
import { collections } from '../config/db';
import { isVerifiedTechnician } from '../lib/isVerifiedTechnician';
import { publicApiLimiter } from '../middleware/rateLimit';

const router = Router();

// GET /api/technicians/:email - public technician profile with their approved services
router.get('/:email', publicApiLimiter, async (req, res) => {
  const email = req.params.email as string;

  const technician = await collections.users().findOne({ email, role: 'technician' });

  if (!technician) {
    return res.status(404).send({ message: 'Technician not found' });
  }

  const services = await collections
    .services()
    .find({ technicianEmail: email, approvalStatus: 'approved', isAvailable: true })
    .sort({ createdAt: -1 })
    .toArray();

  const verified = await isVerifiedTechnician(email);

  res.send({
    name: technician.name,
    email: technician.email,
    image: technician.image || null,
    area: technician.area || '',
    bio: technician.bio || '',
    isVerified: verified,
    services,
  });
});

export default router;
