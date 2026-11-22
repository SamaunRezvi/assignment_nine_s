import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { connectDB } from './config/db';
import { createAuth } from './config/auth';
import authRoutes from './routes/authRoutes';
import serviceRoutes from './routes/serviceRoutes';
import bookingRoutes from './routes/bookingRoutes';
import paymentRoutes from './routes/paymentRoutes';
import adminRoutes from './routes/adminRoutes';
import userRoutes from './routes/userRoutes';
import technicianRoutes from './routes/technicianRoutes';

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = [process.env.CLIENT_URL, 'http://localhost:3000'].filter(Boolean) as string[];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    maxAge: 86400,
  })
);

async function start() {
  await connectDB();
  const auth = createAuth();

  app.all('/api/auth/*splat', toNodeHandler(auth));

  // Stripe webhook needs the raw body, so it must be mounted before express.json()
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json({ limit: '2mb' }));

  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });

  app.get('/', (_req, res) => {
    res.send({ message: 'FixMate server is running' });
  });

  app.use('/api/jwt', authRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/technicians', technicianRoutes);

  app.get('/health', (_req, res) => {
    res.send({ status: 'ok', uptime: process.uptime() });
  });

  app.use((_req, res) => {
    res.status(404).send({ message: 'Route not found' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).send({ message: 'Something went wrong on the server' });
  });

  app.listen(port, () => {
    console.log(`FixMate server listening on port ${port}`);
  });
}

start();
