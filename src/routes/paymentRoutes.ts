import { Router } from 'express';
import { ObjectId } from 'mongodb';
import Stripe from 'stripe';
import { collections } from '../config/db';
import { verifyToken, verifyCustomer } from '../middleware/auth';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// POST /api/payments/create-checkout-session - customer only, owner only, completed+unpaid only (Challenge 3)
router.post('/create-checkout-session', verifyToken, verifyCustomer, async (req, res) => {
  const { bookingId } = req.body;

  if (!bookingId || !ObjectId.isValid(bookingId)) {
    return res.status(400).send({ message: 'Invalid booking' });
  }

  const booking = await collections.bookings().findOne({ _id: new ObjectId(bookingId) });

  if (!booking) {
    return res.status(404).send({ message: 'Booking not found' });
  }

  if (booking.customerEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  if (booking.status !== 'completed' || booking.paymentStatus !== 'unpaid') {
    return res.status(409).send({ message: 'This booking is not ready for payment' });
  }

  if (!(booking.finalAmount > 0)) {
    return res.status(409).send({ message: 'This booking has no valid amount to pay' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: booking.serviceTitle },
          unit_amount: Math.round(booking.finalAmount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    metadata: {
      bookingId: String(booking._id),
      customerEmail: booking.customerEmail,
    },
  });

  res.send({ url: session.url });
});

async function savePaymentOnce(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return;

  const existing = await collections.payments().findOne({ stripeSessionId: session.id });
  if (existing) return;

  const booking = await collections.bookings().findOne({ _id: new ObjectId(bookingId) });
  if (!booking || booking.paymentStatus === 'paid') return;

  await collections.payments().insertOne({
    bookingId,
    serviceTitle: booking.serviceTitle,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,
    amount: booking.finalAmount,
    currency: 'usd',
    transactionId: session.payment_intent as string,
    stripeSessionId: session.id,
    paymentStatus: 'paid',
    paidAt: new Date(),
  });

  await collections.bookings().updateOne(
    { _id: new ObjectId(bookingId) },
    {
      $set: { paymentStatus: 'paid' },
      $push: { statusHistory: { status: 'paid', changedAt: new Date() } } as never,
    }
  );
}

// GET /api/payments/verify - customer only, success-page verification
router.get('/verify', verifyToken, verifyCustomer, async (req, res) => {
  const { session_id } = req.query as Record<string, string>;

  if (!session_id) {
    return res.status(400).send({ message: 'Session id is required' });
  }

  const session = await stripe.checkout.sessions.retrieve(session_id);

  if (session.metadata?.customerEmail !== req.user!.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  if (session.payment_status !== 'paid') {
    return res.status(409).send({ message: 'Payment not completed' });
  }

  await savePaymentOnce(session);

  const payment = await collections.payments().findOne({ stripeSessionId: session.id });
  res.send(payment);
});

// POST /api/payments/webhook - Stripe webhook, raw body required (mounted before json parser)
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    await savePaymentOnce(session);
  }

  res.send({ received: true });
});

// GET /api/payments/my - customer only, own payment history
router.get('/my', verifyToken, verifyCustomer, async (req, res) => {
  const payments = await collections
    .payments()
    .find({ customerEmail: req.user!.email })
    .sort({ paidAt: -1 })
    .toArray();

  res.send(payments);
});

export default router;
