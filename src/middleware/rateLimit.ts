import rateLimit from 'express-rate-limit';

// Applied only to public, unauthenticated GET routes. Routes already gated
// by verifyToken/verifyCustomer/verifyTechnician/verifyAdmin do not need this.
export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});
