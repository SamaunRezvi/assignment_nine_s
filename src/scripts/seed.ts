import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const SERVER_URL = process.env.SEED_SERVER_URL || 'http://localhost:5000';

const PASSWORD = 'Password123';

const technicians = [
  { name: 'Rafiq Hasan', email: 'rafiq.technician@fixmate.test', area: 'Mirpur, Dhaka', bio: 'Certified electronics repair technician with 8 years of experience in smartphones and laptops.' },
  { name: 'Nadia Islam', email: 'nadia.technician@fixmate.test', area: 'Dhanmondi, Dhaka', bio: 'Specialist in home appliance repair including AC, refrigerator and washing machine servicing.' },
];

const customers = [
  { name: 'Tanvir Ahmed', email: 'tanvir.customer@fixmate.test' },
  { name: 'Sumaiya Khan', email: 'sumaiya.customer@fixmate.test' },
];

const admin = { name: 'FixMate Admin', email: 'admin@fixmate.test' };

const serviceTemplates = [
  { title: 'iPhone Screen Replacement', category: 'Smartphone', description: 'Original quality screen replacement for all iPhone models with a 30 day warranty on parts and labor.', basePrice: 45, estimatedDuration: '2-3 hours', serviceMode: 'Shop Drop-off', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/0jQqY1n/phone-repair.jpg' },
  { title: 'Samsung Battery Replacement', category: 'Smartphone', description: 'Fast battery swap for Samsung Galaxy devices using genuine replacement cells.', basePrice: 25, estimatedDuration: '1 hour', serviceMode: 'Shop Drop-off', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/0jQqY1n/phone-repair.jpg' },
  { title: 'Laptop Keyboard Repair', category: 'Laptop & PC', description: 'Keyboard replacement and repair for all major laptop brands, including key-by-key fixes.', basePrice: 35, estimatedDuration: '1 day', serviceMode: 'Shop Drop-off', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/3Yk8wQp/laptop-repair.jpg' },
  { title: 'Laptop Motherboard Diagnosis', category: 'Laptop & PC', description: 'Full diagnostic and repair service for laptops that will not power on or boot correctly.', basePrice: 60, estimatedDuration: '2-3 days', serviceMode: 'Shop Drop-off', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/3Yk8wQp/laptop-repair.jpg' },
  { title: 'Desktop PC Assembly and Setup', category: 'Laptop & PC', description: 'Custom desktop PC assembly, OS installation and performance tuning at your home.', basePrice: 40, estimatedDuration: '3-4 hours', serviceMode: 'Home Visit', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/3Yk8wQp/laptop-repair.jpg' },
  { title: 'Split AC Gas Refill and Servicing', category: 'AC', description: 'Complete AC servicing including gas refill, filter cleaning and cooling performance check.', basePrice: 50, estimatedDuration: '2 hours', serviceMode: 'Home Visit', serviceArea: 'Dhanmondi, Dhaka', image: 'https://i.ibb.co/6yfD3LQ/ac-repair.jpg' },
  { title: 'AC Installation Service', category: 'AC', description: 'Professional split AC installation with proper piping and outdoor unit mounting.', basePrice: 70, estimatedDuration: '3-4 hours', serviceMode: 'Home Visit', serviceArea: 'Dhanmondi, Dhaka', image: 'https://i.ibb.co/6yfD3LQ/ac-repair.jpg' },
  { title: 'Refrigerator Cooling Repair', category: 'Refrigerator', description: 'Diagnosis and repair of cooling issues, compressor problems and thermostat faults.', basePrice: 55, estimatedDuration: '2-3 hours', serviceMode: 'Home Visit', serviceArea: 'Dhanmondi, Dhaka', image: 'https://i.ibb.co/mJvQ3zT/fridge-repair.jpg' },
  { title: 'Refrigerator Door Seal Replacement', category: 'Refrigerator', description: 'Replace worn door seals to restore proper cooling efficiency and reduce energy use.', basePrice: 20, estimatedDuration: '1 hour', serviceMode: 'Home Visit', serviceArea: 'Dhanmondi, Dhaka', image: 'https://i.ibb.co/mJvQ3zT/fridge-repair.jpg' },
  { title: 'LED TV Panel Repair', category: 'TV', description: 'Screen and panel repair service for LED and LCD televisions of all major brands.', basePrice: 65, estimatedDuration: '1-2 days', serviceMode: 'Shop Drop-off', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/8gV3hWq/tv-repair.jpg' },
  { title: 'Smart TV Software Troubleshooting', category: 'TV', description: 'Fix software issues, app crashes and connectivity problems on smart televisions.', basePrice: 20, estimatedDuration: '1 hour', serviceMode: 'Home Visit', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/8gV3hWq/tv-repair.jpg' },
  { title: 'Washing Machine Motor Repair', category: 'Washing Machine', description: 'Motor and drum repair service for front load and top load washing machines.', basePrice: 45, estimatedDuration: '2-3 hours', serviceMode: 'Home Visit', serviceArea: 'Dhanmondi, Dhaka', image: 'https://i.ibb.co/3WBF3Zy/washer-repair.jpg' },
  { title: 'Washing Machine Water Leak Fix', category: 'Washing Machine', description: 'Identify and fix water leakage issues from hoses, seals or the drum assembly.', basePrice: 30, estimatedDuration: '1-2 hours', serviceMode: 'Home Visit', serviceArea: 'Dhanmondi, Dhaka', image: 'https://i.ibb.co/3WBF3Zy/washer-repair.jpg' },
  { title: 'Home Electrical Wiring Inspection', category: 'Electrical', description: 'Full home wiring safety inspection with a written report of any issues found.', basePrice: 35, estimatedDuration: '2 hours', serviceMode: 'Home Visit', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/vxQw9Zz/electrical.jpg' },
  { title: 'Circuit Breaker Installation', category: 'Electrical', description: 'Safe installation and replacement of circuit breakers and distribution boards.', basePrice: 40, estimatedDuration: '2-3 hours', serviceMode: 'Home Visit', serviceArea: 'Mirpur, Dhaka', image: 'https://i.ibb.co/vxQw9Zz/electrical.jpg' },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerUser(name: string, email: string, role: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${SERVER_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: process.env.CLIENT_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({ name, email, password: PASSWORD, role }),
    });

    if (res.ok) return;

    const text = await res.text();

    if (text.includes('already exists') || text.includes('USER_ALREADY_EXISTS')) {
      console.log(`Already registered, skipping: ${email}`);
      return;
    }

    if (res.status === 429) {
      console.log(`Rate limited, waiting before retry: ${email}`);
      await sleep(5000);
      continue;
    }

    throw new Error(`Failed to register ${email}: ${res.status} ${text}`);
  }

  throw new Error(`Failed to register ${email} after retries`);
}

async function main() {
  console.log(`Seeding against server: ${SERVER_URL}`);

  for (const tech of technicians) {
    await registerUser(tech.name, tech.email, 'technician');
    console.log(`Registered technician: ${tech.email}`);
    await sleep(3000);
  }

  for (const customer of customers) {
    await registerUser(customer.name, customer.email, 'customer');
    console.log(`Registered customer: ${customer.email}`);
    await sleep(3000);
  }

  await registerUser(admin.name, admin.email, 'customer');
  console.log(`Registered admin account (role will be elevated directly in the database): ${admin.email}`);

  const client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'fixmate');

  await db.collection('user').updateOne({ email: admin.email }, { $set: { role: 'admin' } });
  for (const tech of technicians) {
    await db.collection('user').updateOne(
      { email: tech.email },
      { $set: { area: tech.area, bio: tech.bio } }
    );
  }
  console.log('Updated admin role and technician profile details');

  const techDocs = await db.collection('user').find({ email: { $in: technicians.map((t) => t.email) } }).toArray();
  const techByEmail = new Map(techDocs.map((t) => [t.email, t]));

  const serviceDocs = serviceTemplates.map((tpl, i) => {
    const tech = technicians[i % technicians.length];
    const techDoc = techByEmail.get(tech.email);
    return {
      title: tpl.title,
      category: tpl.category,
      description: tpl.description,
      image: tpl.image,
      basePrice: tpl.basePrice,
      estimatedDuration: tpl.estimatedDuration,
      serviceMode: tpl.serviceMode,
      serviceArea: tpl.serviceArea,
      technicianName: techDoc?.name || tech.name,
      technicianEmail: tech.email,
      approvalStatus: 'approved',
      isAvailable: true,
      createdAt: new Date(Date.now() - i * 1000 * 60 * 60 * 24),
    };
  });

  await db.collection('services').deleteMany({ technicianEmail: { $in: technicians.map((t) => t.email) } });
  const insertResult = await db.collection('services').insertMany(serviceDocs);
  console.log(`Inserted ${insertResult.insertedCount} services`);

  const insertedServices = await db.collection('services').find({ _id: { $in: Object.values(insertResult.insertedIds) } }).toArray();

  const customerDocs = await db.collection('user').find({ email: { $in: customers.map((c) => c.email) } }).toArray();
  const customerByEmail = new Map(customerDocs.map((c) => [c.email, c]));

  function makeBooking(serviceIndex: number, customerIndex: number, status: string, paymentStatus: string, daysAgo: number) {
    const service = insertedServices[serviceIndex];
    const customer = customers[customerIndex];
    const customerDoc = customerByEmail.get(customer.email);
    return {
      serviceId: String(service._id),
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: customerDoc?.name || customer.name,
      customerEmail: customer.email,
      customerPhone: '01700000000',
      address: 'House 12, Road 5, Dhaka',
      preferredDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
      problemDescription: 'The device is not working properly and needs a professional inspection and repair.',
      status,
      finalAmount: service.basePrice,
      paymentStatus,
      createdAt: new Date(Date.now() - daysAgo * 1000 * 60 * 60 * 24),
    };
  }

  const bookingDocs = [
    makeBooking(0, 0, 'requested', 'unpaid', 1),
    makeBooking(1, 1, 'accepted', 'unpaid', 2),
    makeBooking(5, 0, 'in-progress', 'unpaid', 3),
    makeBooking(6, 1, 'completed', 'unpaid', 4),
    makeBooking(8, 0, 'completed', 'paid', 6),
    makeBooking(11, 1, 'rejected', 'unpaid', 5),
    makeBooking(12, 0, 'cancelled', 'unpaid', 2),
  ];

  await db.collection('bookings').deleteMany({ customerEmail: { $in: customers.map((c) => c.email) } });
  const bookingInsert = await db.collection('bookings').insertMany(bookingDocs);
  console.log(`Inserted ${bookingInsert.insertedCount} bookings`);

  const insertedBookings = await db.collection('bookings').find({ _id: { $in: Object.values(bookingInsert.insertedIds) } }).toArray();
  const paidBooking = insertedBookings.find((b) => b.paymentStatus === 'paid');

  if (paidBooking) {
    await db.collection('payments').deleteMany({ bookingId: String(paidBooking._id) });
    await db.collection('payments').insertOne({
      bookingId: String(paidBooking._id),
      serviceTitle: paidBooking.serviceTitle,
      customerName: paidBooking.customerName,
      customerEmail: paidBooking.customerEmail,
      technicianName: paidBooking.technicianName,
      technicianEmail: paidBooking.technicianEmail,
      amount: paidBooking.finalAmount,
      currency: 'usd',
      transactionId: 'pi_seed_demo_transaction',
      stripeSessionId: 'cs_seed_demo_session',
      paymentStatus: 'paid',
      paidAt: new Date(Date.now() - 6 * 1000 * 60 * 60 * 24),
    });
    console.log('Inserted 1 payment record');
  }

  await client.close();
  console.log('Seeding complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
