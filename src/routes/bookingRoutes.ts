import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { collections } from '../config/db';
import { verifyToken, verifyCustomer, verifyTechnician } from '../middleware/auth';
import { sendBookingStatusEmail } from '../lib/email';

const router = Router();

const ACTIVE_STATUSES = ['requested', 'accepted', 'in-progress'];
const ALL_STATUSES = ['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled', 'reschedule-proposed'];
const SHIFTS = ['morning', 'noon', 'evening', 'night'];

// POST /api/bookings - customer only
router.post('/', verifyToken, verifyCustomer, async (req, res) => {
  const user = req.user!;
  const { serviceId, preferredDate, shift } = req.body;
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';
  const problemDescription = typeof req.body.problemDescription === 'string' ? req.body.problemDescription.trim() : '';

  if (!serviceId || !phone || !address || !preferredDate || !problemDescription || !shift) {
    return res.status(400).send({ message: 'All fields are required' });
  }

  if (!SHIFTS.includes(shift)) {
    return res.status(400).send({ message: 'Shift must be morning, noon, evening or night' });
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

  const technician = await collections.users().findOne({ email: service.technicianEmail });
  const preferredDateStr = preferredDate.slice(0, 10);

  if (technician?.unavailableDates?.includes(preferredDateStr)) {
    return res.status(409).send({ message: 'The technician is not available on this date' });
  }

  const isShiftLocked = technician?.lockedShifts?.some(
    (entry: { date: string; shift: string }) => entry.date === preferredDateStr && entry.shift === shift
  );

  if (isShiftLocked) {
    return res.status(409).send({ message: 'This shift is fully booked. Please choose another shift or date.' });
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
    shift,
    problemDescription,
    status: 'requested',
    finalAmount: service.basePrice,
    paymentStatus: 'unpaid',
    statusHistory: [{ status: 'requested', changedAt: new Date() }],
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

  if (status && status !== 'all' && !ALL_STATUSES.includes(status)) {
    return res.status(400).send({ message: 'Invalid status filter' });
  }

  const query: Record<string, unknown> = { technicianEmail: req.user!.email };
  if (status && status !== 'all') {
    query.status = status;
  }

  const bookings = await collections.bookings().find(query).sort({ createdAt: -1 }).toArray();

  // Technicians see the star rating only, the written review stays customer/admin only.
  const sanitized = bookings.map(({ review, ...rest }) => rest);
  res.send(sanitized);
});

// GET /api/bookings/:id - owner (customer or technician) or admin only
router.get('/:id', verifyToken, async (req, res) => {
  const id = req.params.id as string;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  const booking = await collections.bookings().findOne({ _id: new ObjectId(id) });

  if (!booking) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  const user = req.user!;
  const isOwner =
    (user.role === 'customer' && booking.customerEmail === user.email) ||
    (user.role === 'technician' && booking.technicianEmail === user.email);

  if (!isOwner && user.role !== 'admin') {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (user.role === 'technician') {
    const { review, ...rest } = booking;
    return res.send(rest);
  }

  res.send(booking);
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

  await collections.bookings().updateOne(
    { _id: new ObjectId(id) },
    {
      $set: { status: 'cancelled' },
      $push: { statusHistory: { status: 'cancelled', changedAt: new Date() } } as never,
    }
  );
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
  const completionPhoto = typeof req.body.completionPhoto === 'string' ? req.body.completionPhoto : undefined;
  const assignedTimeSlot = typeof req.body.assignedTimeSlot === 'string' ? req.body.assignedTimeSlot.trim() : undefined;

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

  if (status === 'accepted' && assignedTimeSlot) {
    update.assignedTimeSlot = assignedTimeSlot;
  }

  if (status === 'completed') {
    const amount = Number(finalAmount);
    if (!amount || amount <= 0) {
      return res.status(400).send({ message: 'A valid final amount is required to complete a job' });
    }
    update.finalAmount = amount;
    if (completionPhoto) update.completionPhoto = completionPhoto;
  }

  await collections.bookings().updateOne(
    { _id: new ObjectId(id) },
    {
      $set: update,
      $push: { statusHistory: { status, changedAt: new Date() } } as never,
    }
  );

  if (status === 'accepted' || status === 'rejected' || status === 'completed') {
    void sendBookingStatusEmail(
      {
        customerEmail: booking.customerEmail,
        customerName: booking.customerName,
        serviceTitle: booking.serviceTitle,
        technicianName: booking.technicianName,
        finalAmount: status === 'completed' ? Number(finalAmount) : undefined,
        assignedTimeSlot: status === 'accepted' ? assignedTimeSlot : undefined,
      },
      status
    );
  }

  res.send({ message: 'Booking status updated' });
});

// PATCH /api/bookings/:id/propose-reschedule - technician only, owner only, requested only
router.patch('/:id/propose-reschedule', verifyToken, verifyTechnician, async (req, res) => {
  const id = req.params.id as string;
  const { proposedDate, proposedShift } = req.body;
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (!proposedDate || !SHIFTS.includes(proposedShift)) {
    return res.status(400).send({ message: 'A valid proposed date and shift are required' });
  }

  const proposedDateObj = new Date(proposedDate);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (Number.isNaN(proposedDateObj.getTime()) || proposedDateObj < startOfToday) {
    return res.status(400).send({ message: 'Proposed date must be today or a future date' });
  }

  const booking = await collections.bookings().findOne({ _id: new ObjectId(id) });

  if (!booking) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (booking.technicianEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  if (booking.status !== 'requested') {
    return res.status(409).send({ message: 'Only a requested booking can be rescheduled' });
  }

  await collections.bookings().updateOne(
    { _id: new ObjectId(id) },
    {
      $set: { status: 'reschedule-proposed', proposedDate: proposedDateObj, proposedShift, rescheduleMessage: message },
      $push: { statusHistory: { status: 'reschedule-proposed', changedAt: new Date() } } as never,
    }
  );

  void sendBookingStatusEmail(
    {
      customerEmail: booking.customerEmail,
      customerName: booking.customerName,
      serviceTitle: booking.serviceTitle,
      technicianName: booking.technicianName,
      proposedDate: proposedDateObj.toLocaleDateString(),
      proposedShift,
    },
    'reschedule-proposed'
  );

  res.send({ message: 'Reschedule proposed' });
});

// PATCH /api/bookings/:id/reschedule-response - customer only, owner only, reschedule-proposed only
router.patch('/:id/reschedule-response', verifyToken, verifyCustomer, async (req, res) => {
  const id = req.params.id as string;
  const { accept } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (typeof accept !== 'boolean') {
    return res.status(400).send({ message: 'accept must be true or false' });
  }

  const booking = await collections.bookings().findOne({ _id: new ObjectId(id) });

  if (!booking) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (booking.customerEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  if (booking.status !== 'reschedule-proposed') {
    return res.status(409).send({ message: 'This booking has no pending reschedule proposal' });
  }

  if (accept) {
    await collections.bookings().updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { status: 'requested', preferredDate: booking.proposedDate, shift: booking.proposedShift },
        $unset: { proposedDate: '', proposedShift: '', rescheduleMessage: '' },
        $push: { statusHistory: { status: 'requested', changedAt: new Date() } } as never,
      }
    );
    return res.send({ message: 'Reschedule accepted' });
  }

  await collections.bookings().updateOne(
    { _id: new ObjectId(id) },
    {
      $set: { status: 'rejected' },
      $push: { statusHistory: { status: 'rejected', changedAt: new Date() } } as never,
    }
  );
  res.send({ message: 'Reschedule rejected' });
});

// PATCH /api/bookings/:id/rating - customer only, owner only, paid + completed only, once
router.patch('/:id/rating', verifyToken, verifyCustomer, async (req, res) => {
  const id = req.params.id as string;
  const { rating } = req.body;
  const review = typeof req.body.review === 'string' ? req.body.review.trim() : '';

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).send({ message: 'Rating must be a whole number between 1 and 5' });
  }

  if (!review) {
    return res.status(400).send({ message: 'A review is required' });
  }

  const booking = await collections.bookings().findOne({ _id: new ObjectId(id) });

  if (!booking) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (booking.customerEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  if (booking.status !== 'completed' || booking.paymentStatus !== 'paid') {
    return res.status(409).send({ message: 'You can only rate a completed and paid job' });
  }

  if (booking.rating) {
    return res.status(409).send({ message: 'You have already rated this job' });
  }

  const ratedAt = new Date();
  const result = await collections.bookings().updateOne(
    {
      _id: new ObjectId(id), customerEmail: req.user!.email,
      status: 'completed', paymentStatus: 'paid',
      $or: [{ rating: { $exists: false } }, { rating: null }],
    },
    {
      $set: { rating, review, ratedAt },
      $push: { statusHistory: { status: 'rated', changedAt: ratedAt } } as never,
    }
  );
  if (!result.matchedCount) return res.status(409).send({ message: 'You have already rated this job' });
  res.send({ message: 'Thank you for your feedback' });
});

export default router;
