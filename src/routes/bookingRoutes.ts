import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { collections } from '../config/db';
import { verifyToken, verifyCustomer, verifyTechnician } from '../middleware/auth';

const router = Router();

const ACTIVE_STATUSES = ['requested', 'accepted', 'in-progress'];

// POST /api/bookings - customer only
router.post('/', verifyToken, verifyCustomer, async (req, res) => {
  const user = req.user!;
  const { serviceId, preferredDate } = req.body;
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';
  const problemDescription = typeof req.body.problemDescription === 'string' ? req.body.problemDescription.trim() : '';

  if (!serviceId || !phone || !address || !preferredDate || !problemDescription) {
    return res.status(400).send({ message: 'All fields are required' });
  }

  if (problemDescription.length < 20) {
    return res.status(400).send({ message: 'Problem description must be at least 20 characters' });
  }

  const requestedDate = new Date(preferredDate);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (Number.isNaN(requestedDate.getTime()) || requestedDate < startOfToday) {
    return res.status(400).send({ message: 'Preferred date must be today or a future date' });
  }

  if (!ObjectId.isValid(serviceId)) {
    return res.status(400).send({ message: 'Invalid service' });
  }

  const service = await collections.services().findOne({ _id: new ObjectId(serviceId) });

  if (!service || service.approvalStatus !== 'approved' || !service.isAvailable) {
    return res.status(404).send({ message: 'Service not found' });
  }

  if (service.technicianEmail === user.email) {
    return res.status(403).send({ message: 'You cannot request your own service' });
  }

  const existingActive = await collections.bookings().findOne({
    serviceId,
    customerEmail: user.email,
    status: { $in: ACTIVE_STATUSES },
  });

  if (existingActive) {
    return res.status(409).send({ message: 'You already have an active request for this service' });
  }

  const customer = await collections.users().findOne({ email: user.email });

  const booking = {
    serviceId,
    serviceTitle: service.title,
    serviceImage: service.image,
    category: service.category,
    basePrice: service.basePrice,
    technicianName: service.technicianName,
    technicianEmail: service.technicianEmail,
    customerName: customer?.name || '',
    customerEmail: user.email,
    customerPhone: phone,
    address,
    preferredDate: requestedDate,
    problemDescription,
    status: 'requested',
    finalAmount: service.basePrice,
    paymentStatus: 'unpaid',
    createdAt: new Date(),
  };

  const result = await collections.bookings().insertOne(booking);
  res.status(201).send({ insertedId: result.insertedId, ...booking });
});

// GET /api/bookings/my - customer only, own bookings only
router.get('/my', verifyToken, verifyCustomer, async (req, res) => {
  const bookings = await collections
    .bookings()
    .find({ customerEmail: req.user!.email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(bookings);
});

// GET /api/bookings/technician - technician only, own bookings only
router.get('/technician', verifyToken, verifyTechnician, async (req, res) => {
  const { status } = req.query as Record<string, string>;

  const query: Record<string, unknown> = { technicianEmail: req.user!.email };
  if (status && status !== 'all') {
    query.status = status;
  }

  const bookings = await collections.bookings().find(query).sort({ createdAt: -1 }).toArray();
  res.send(bookings);
});

// PATCH /api/bookings/:id/cancel - customer only, owner only, requested only
router.patch('/:id/cancel', verifyToken, verifyCustomer, async (req, res) => {
  const id = req.params.id as string;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  const booking = await collections.bookings().findOne({ _id: new ObjectId(id) });

  if (!booking) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (booking.customerEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  if (booking.status !== 'requested') {
    return res.status(409).send({ message: 'Only a requested booking can be cancelled' });
  }

  await collections.bookings().updateOne({ _id: new ObjectId(id) }, { $set: { status: 'cancelled' } });
  res.send({ message: 'Booking cancelled' });
});

// Allowed forward transitions a technician can apply, and the status it requires to be in now.
const TECHNICIAN_TRANSITIONS: Record<string, string> = {
  accepted: 'requested',
  rejected: 'requested',
  'in-progress': 'accepted',
  completed: 'in-progress',
};

// PATCH /api/bookings/:id/status - technician only, owner only, enforced pipeline (Challenge 3)
router.patch('/:id/status', verifyToken, verifyTechnician, async (req, res) => {
  const id = req.params.id as string;
  const { status, finalAmount } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (!status || !(status in TECHNICIAN_TRANSITIONS)) {
    return res.status(400).send({ message: 'Invalid status' });
  }

  const booking = await collections.bookings().findOne({ _id: new ObjectId(id) });

  if (!booking) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (booking.technicianEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const requiredCurrentStatus = TECHNICIAN_TRANSITIONS[status];
  if (booking.status !== requiredCurrentStatus) {
    return res.status(409).send({ message: `Cannot move from ${booking.status} to ${status}` });
  }

  const update: Record<string, unknown> = { status };

  if (status === 'completed') {
    const amount = Number(finalAmount);
    if (!amount || amount <= 0) {
      return res.status(400).send({ message: 'A valid final amount is required to complete a job' });
    }
    update.finalAmount = amount;
  }

  await collections.bookings().updateOne({ _id: new ObjectId(id) }, { $set: update });
  res.send({ message: 'Booking status updated' });
});

export default router;
