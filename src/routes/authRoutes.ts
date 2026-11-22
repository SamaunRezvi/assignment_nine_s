import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { collections } from '../config/db';

const router = Router();

// Issues an API JWT for an already-authenticated BetterAuth user (by email).
// The client calls this right after sign-in/sign-up to get a token for API requests.
router.post('/', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  const user = await collections.users().findOne({ email });

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

export default router;
