import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { getDB } from './db';

export function createAuth() {
  return betterAuth({
    database: mongodbAdapter(getDB()),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: [
      process.env.CLIENT_URL as string,
    ].filter(Boolean),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'customer',
          input: true,
        },
        phone: {
          type: 'string',
          required: false,
          input: true,
        },
        area: {
          type: 'string',
          required: false,
          input: true,
        },
        bio: {
          type: 'string',
          required: false,
          input: true,
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
