![FixMate API animated server illustration with repair job status cards](https://raw.githubusercontent.com/SamaunRezvi/assignment_nine_s/main/docs/readme-hero.svg)

<div align="center">

# FixMate API

[![Live Site](https://img.shields.io/badge/Live_Site-0D9488?style=for-the-badge&logo=render&logoColor=F0FDFA)](https://fixmate-server-qkj7.onrender.com)
[![Client repository](https://img.shields.io/badge/Client_repository-134E4A?style=for-the-badge&logo=github&logoColor=2DD4BF)](https://github.com/SamaunRezvi/assignment_nine_c)
[![Overview](https://img.shields.io/badge/Overview-0F172A?style=for-the-badge)](#overview)
[![API Reference](https://img.shields.io/badge/API_Reference-0F172A?style=for-the-badge)](#api-reference)
[![Get Started locally](https://img.shields.io/badge/Get_Started_locally-F59E0B?style=for-the-badge&logoColor=0F172A)](#get-started-locally)

## Book the job. Pay after it's done.

Backend API for FixMate, an on-demand device and home appliance repair service booking platform.

**ROLE-BASED JWT AUTH** · **SERVER-ENFORCED STATUS PIPELINE** · **STRIPE PAY-AFTER-SERVICE** · **SEARCH, FILTER, SORT**

</div>

## Overview [](#overview)

FixMate connects customers with verified technicians for device and appliance repairs. Technicians list their services, customers send repair requests, jobs move through a tracked status pipeline, and payment happens only after the job is marked completed.

| | |
|---|---|
| Live API | https://fixmate-server-qkj7.onrender.com |
| Client repository | https://github.com/SamaunRezvi/assignment_nine_c |
| Client live site | https://fixmate-nu-five.vercel.app |

## Test Credentials

All seeded accounts use the password `Password123`.

| Role | Email |
|---|---|
| Admin | admin@fixmate.test |
| Technician | rafiq.technician@fixmate.test |
| Technician | nadia.technician@fixmate.test |
| Technician | imran.technician@fixmate.test |
| Customer | tanvir.customer@fixmate.test |
| Customer | sumaiya.customer@fixmate.test |

## Tech Stack

[![Node.js, Express, TypeScript, MongoDB, Stripe, GitHub](https://skillicons.dev/icons?i=nodejs,express,typescript,mongodb,stripe,github&theme=dark)](https://skillicons.dev)

| Layer | Technology | Responsibility |
|---|---|---|
| Runtime | Node.js, Express, TypeScript | HTTP server and routing |
| Database | MongoDB (native driver) | 4 collections: users, services, bookings, payments |
| Authentication | BetterAuth, MongoDB adapter | Email/password and Google sign-in |
| Authorization | JWT, custom middleware | verifyToken, verifyCustomer, verifyTechnician, verifyAdmin |
| Payments | Stripe Checkout, webhook | Pay-after-service, deduplicated by stripeSessionId |

## Key Features

- Role-based middleware (`verifyToken`, `verifyCustomer`, `verifyTechnician`, `verifyAdmin`) protecting every private route
- Server-side search, filter (category, service mode, area), sort, and pagination for the services listing
- Strict server-enforced job status pipeline (requested → accepted/rejected/cancelled → in-progress → completed → paid), no stage can be skipped or reversed
- Stripe Checkout session creation, success-page verification, and webhook handling with payment deduplication
- Google social sign-in alongside email and password, via BetterAuth
- Rating and review on paid bookings, with average rating surfaced on service listings
- Derived "verified technician" status for any technician with at least one admin-approved service
- Public technician profile endpoint listing a technician's approved services
- Admin endpoints for user role management, service approval, and platform-wide monitoring

## Booking Status Pipeline

```mermaid
sequenceDiagram
    participant Customer
    participant Technician
    participant Stripe

    Customer->>+Technician: Requested
    Technician-->>Customer: Accepted
    Technician-->>Customer: Rejected (final)
    Customer-->>Customer: Cancelled (final, only while Requested)
    Technician->>Technician: In Progress
    Technician->>Technician: Completed (sets finalAmount)
    Customer->>+Stripe: Pay Now (completed + unpaid)
    Stripe-->>Customer: Paid (final)
```

## API Reference [](#api-reference)

| Endpoint | Middleware | Notes |
|---|---|---|
| `GET /api/services` | Public | Search, filter, sort, pagination |
| `GET /api/services/:id` | Public | 404 unless approved and available |
| `GET /api/services/featured` | Public | Latest 6 approved services |
| `POST /api/services` | verifyToken, verifyTechnician | Creates with approvalStatus: pending |
| `PATCH /api/services/:id` | verifyToken, verifyTechnician | Owner only, resets to pending |
| `DELETE /api/services/:id` | verifyToken, verifyTechnician | Owner only |
| `GET /api/technicians/:email` | Public | Profile and approved services |
| `POST /api/bookings` | verifyToken, verifyCustomer | Rejects duplicate active requests |
| `GET /api/bookings/my` | verifyToken, verifyCustomer | Own bookings only |
| `GET /api/bookings/technician` | verifyToken, verifyTechnician | Own jobs only |
| `PATCH /api/bookings/:id/status` | verifyToken, verifyTechnician | Enforced pipeline, owner only |
| `PATCH /api/bookings/:id/cancel` | verifyToken, verifyCustomer | Only while requested |
| `PATCH /api/bookings/:id/rating` | verifyToken, verifyCustomer | Only on a paid, completed, unrated booking |
| `POST /api/payments/create-checkout-session` | verifyToken, verifyCustomer | Amount always server-derived |
| `GET /api/payments/verify` | verifyToken, verifyCustomer | Success-page verification |
| `POST /api/payments/webhook` | Stripe signature | Deduplicated by stripeSessionId |
| `GET /api/admin/*` | verifyToken, verifyAdmin | Users, services, bookings, payments |
| `PATCH /api/users/profile` | verifyToken | Own profile only |

## Get Started Locally [](#get-started-locally)

```bash
git clone https://github.com/SamaunRezvi/assignment_nine_s.git
cd assignment_nine_s
npm install
cp .env.example .env
npm run dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `DB_NAME` | Database name |
| `JWT_SECRET` | Secret for signing API JWTs |
| `BETTER_AUTH_SECRET` | BetterAuth session secret |
| `BETTER_AUTH_URL` | This server's own base URL |
| `CLIENT_URL` | Client origin, used for CORS and BetterAuth trusted origins |
| `STRIPE_SECRET_KEY` | Stripe test mode secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `IMGBB_API_KEY` | ImgBB API key for image uploads |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

## npm Packages Used

express, mongodb, cors, dotenv, jsonwebtoken, stripe, better-auth, typescript, ts-node-dev

<div align="center">

**FIXMATE API**

Role-based repair booking backend, built with Express and MongoDB

[Explore FixMate ↗](https://fixmate-nu-five.vercel.app) · [Back to top ↑](#fixmate-api)

</div>
