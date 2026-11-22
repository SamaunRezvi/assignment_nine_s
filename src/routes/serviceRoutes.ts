import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { collections } from '../config/db';
import { verifyToken, verifyTechnician } from '../middleware/auth';

const router = Router();

const CATEGORIES = [
  'Smartphone',
  'Laptop & PC',
  'AC',
  'Refrigerator',
  'TV',
  'Washing Machine',
  'Electrical',
];

async function attachRatingSummary<T extends { _id: unknown }>(services: T[]): Promise<(T & { averageRating?: number; reviewCount?: number })[]> {
  if (services.length === 0) return services;

  const serviceIds = services.map((s) => String(s._id));

  const summaries = await collections
    .bookings()
    .aggregate([
      { $match: { serviceId: { $in: serviceIds }, rating: { $exists: true } } },
      { $group: { _id: '$serviceId', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
    ])
    .toArray();

  const summaryById = new Map(summaries.map((s) => [s._id as string, s]));

  return services.map((service) => {
    const summary = summaryById.get(String(service._id));
    if (!summary) return service;
    return {
      ...service,
      averageRating: Math.round(summary.averageRating * 10) / 10,
      reviewCount: summary.reviewCount,
    };
  });
}

// GET /api/services - public, supports search/filter/sort/pagination (Challenge 1)
router.get('/', async (req, res) => {
  const { search, category, serviceMode, area, sort, page = '1', limit = '12' } = req.query as Record<string, string>;

  const query: Record<string, unknown> = {
    approvalStatus: 'approved',
    isAvailable: true,
  };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
  }

  if (category && CATEGORIES.includes(category)) {
    query.category = category;
  }

  if (serviceMode) {
    query.serviceMode = serviceMode;
  }

  if (area) {
    query.serviceArea = { $regex: area, $options: 'i' };
  }

  let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
  if (sort === 'price-asc') sortOption = { basePrice: 1 };
  if (sort === 'price-desc') sortOption = { basePrice: -1 };
  if (sort === 'newest') sortOption = { createdAt: -1 };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);

  const cursor = collections
    .services()
    .find(query)
    .sort(sortOption)
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const [rawServices, total] = await Promise.all([
    cursor.toArray(),
    collections.services().countDocuments(query),
  ]);

  const services = await attachRatingSummary(rawServices);

  res.send({ services, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

// GET /api/services/featured - home page, latest 6 approved + available
router.get('/featured', async (_req, res) => {
  const rawServices = await collections
    .services()
    .find({ approvalStatus: 'approved', isAvailable: true })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();

  const services = await attachRatingSummary(rawServices);

  res.send(services);
});

// GET /api/services/:id - public
router.get('/:id', async (req, res) => {
  const id = req.params.id as string;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Service not found' });
  }

  const service = await collections.services().findOne({ _id: new ObjectId(id) });

  if (!service || service.approvalStatus !== 'approved' || !service.isAvailable) {
    return res.status(404).send({ message: 'Service not found' });
  }

  const [withRating] = await attachRatingSummary([service]);

  const approvedCount = await collections
    .services()
    .countDocuments({ technicianEmail: service.technicianEmail, approvalStatus: 'approved' });

  res.send({ ...withRating, isVerified: approvedCount > 0 });
});

// POST /api/services - technician only
router.post('/', verifyToken, verifyTechnician, async (req, res) => {
  const user = req.user!;
  const { category, image, basePrice, estimatedDuration, serviceMode } = req.body;
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const serviceArea = typeof req.body.serviceArea === 'string' ? req.body.serviceArea.trim() : '';

  if (!title || !category || !description || !image || !basePrice || !estimatedDuration || !serviceMode || !serviceArea) {
    return res.status(400).send({ message: 'All fields are required' });
  }

  if (!CATEGORIES.includes(category)) {
    return res.status(400).send({ message: 'Invalid category' });
  }

  if (!['Home Visit', 'Shop Drop-off'].includes(serviceMode)) {
    return res.status(400).send({ message: 'Invalid service mode' });
  }

  if (!(Number(basePrice) > 0)) {
    return res.status(400).send({ message: 'Base price must be a positive number' });
  }

  const technician = await collections.users().findOne({ email: user.email });

  const service = {
    title,
    category,
    description,
    image,
    basePrice: Number(basePrice),
    estimatedDuration,
    serviceMode,
    serviceArea,
    technicianName: technician?.name || '',
    technicianEmail: user.email,
    approvalStatus: 'pending',
    isAvailable: true,
    createdAt: new Date(),
  };

  const result = await collections.services().insertOne(service);
  res.status(201).send({ insertedId: result.insertedId, ...service });
});

// GET /api/services/mine/list - technician's own services (any status)
router.get('/mine/list', verifyToken, verifyTechnician, async (req, res) => {
  const services = await collections
    .services()
    .find({ technicianEmail: req.user!.email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(services);
});

// PATCH /api/services/:id - technician only, owner only, resets to pending
router.patch('/:id', verifyToken, verifyTechnician, async (req, res) => {
  const id = req.params.id as string;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Service not found' });
  }

  const service = await collections.services().findOne({ _id: new ObjectId(id) });

  if (!service) {
    return res.status(404).send({ message: 'Service not found' });
  }

  if (service.technicianEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const { title, category, description, image, basePrice, estimatedDuration, serviceMode, serviceArea } = req.body;

  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(400).send({ message: 'Invalid category' });
  }

  if (serviceMode !== undefined && !['Home Visit', 'Shop Drop-off'].includes(serviceMode)) {
    return res.status(400).send({ message: 'Invalid service mode' });
  }

  if (basePrice !== undefined && !(Number(basePrice) > 0)) {
    return res.status(400).send({ message: 'Base price must be a positive number' });
  }

  const update: Record<string, unknown> = { approvalStatus: 'pending' };
  if (title !== undefined) update.title = title;
  if (category !== undefined) update.category = category;
  if (description !== undefined) update.description = description;
  if (image !== undefined) update.image = image;
  if (basePrice !== undefined) update.basePrice = Number(basePrice);
  if (estimatedDuration !== undefined) update.estimatedDuration = estimatedDuration;
  if (serviceMode !== undefined) update.serviceMode = serviceMode;
  if (serviceArea !== undefined) update.serviceArea = serviceArea;

  await collections.services().updateOne({ _id: new ObjectId(id) }, { $set: update });
  res.send({ message: 'Service updated' });
});

// PATCH /api/services/:id/availability - technician only, owner only
router.patch('/:id/availability', verifyToken, verifyTechnician, async (req, res) => {
  const id = req.params.id as string;
  const { isAvailable } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Service not found' });
  }

  const service = await collections.services().findOne({ _id: new ObjectId(id) });

  if (!service) {
    return res.status(404).send({ message: 'Service not found' });
  }

  if (service.technicianEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  await collections.services().updateOne({ _id: new ObjectId(id) }, { $set: { isAvailable: Boolean(isAvailable) } });
  res.send({ message: 'Availability updated' });
});

// DELETE /api/services/:id - technician only, owner only
router.delete('/:id', verifyToken, verifyTechnician, async (req, res) => {
  const id = req.params.id as string;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Service not found' });
  }

  const service = await collections.services().findOne({ _id: new ObjectId(id) });

  if (!service) {
    return res.status(404).send({ message: 'Service not found' });
  }

  if (service.technicianEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  await collections.services().deleteOne({ _id: new ObjectId(id) });
  res.send({ message: 'Service deleted' });
});

export default router;
