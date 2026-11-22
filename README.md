# FixMate Server

Backend API for FixMate, an on-demand device and home appliance repair service booking platform.

## Purpose

FixMate connects customers with verified technicians for device and appliance repairs. Technicians list their services, customers send repair requests, jobs move through a tracked status pipeline, and payment happens only after the job is completed.

## Live API URL

https://fixmate-server-qkj7.onrender.com

## Test Credentials

All seeded accounts use the password `Password123`.

- Admin: admin@fixmate.test
- Technician: rafiq.technician@fixmate.test
- Technician: nadia.technician@fixmate.test
- Customer: tanvir.customer@fixmate.test
- Customer: sumaiya.customer@fixmate.test

## Tech Stack

- Node.js, Express
- MongoDB (native driver)
- BetterAuth (authentication, MongoDB adapter)
- JWT (role-based API authorization)
- Stripe (checkout and webhook, test mode)

## Key Features

- Role-based middleware (verifyToken, verifyCustomer, verifyTechnician, verifyAdmin) protecting every private route
- Server-side search, filter, sort, and pagination for the services listing
- Strict server-enforced job status pipeline (requested to accepted/rejected/cancelled to in-progress to completed to paid)
- Stripe Checkout session creation, success-page verification, and webhook handling with payment deduplication
- Admin endpoints for user role management, service approval, and platform-wide monitoring

## Environment Variables

See `.env.example` for the full list: MongoDB connection, JWT secret, BetterAuth secret, Stripe keys, ImgBB key, and the client URL for CORS.

## npm Packages Used

express, mongodb, cors, dotenv, jsonwebtoken, stripe, better-auth, typescript, ts-node-dev
