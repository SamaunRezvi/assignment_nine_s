import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { fromNodeHeaders } from 'better-auth/node';
import { collections } from '../config/db';
import type { Auth } from '../config/auth';

// Issues an API JWT for the user identified by the caller's own BetterAuth
// session cookie. The email is never read from the request body, since a
// client-supplied email would let anyone mint a token for any account.
export default function createAuthRoutes(auth: Auth) {
  const router = Router();

  router.post('/', async (req, res) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

    if (!session?.user?.email) {
      return res.status(401).send({ message: 'Not signed in' });
    }

    const user = await collections.users().findOne({ email: session.user.email });

    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    const token = jwt.sign(
      { email: user.email, role: user.role || 'customer' },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    res.send({ token });
  });

  return router;
}
