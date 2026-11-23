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
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
    account: {
      storeStateStrategy: 'cookie',
    },
    databaseHooks: {
      user: {
        create: {
          // The role field is exposed as a sign-up input so a user can pick
          // customer or technician, but the value must never be trusted as
          // sent: force anything other than those two back to customer so
          // nobody can sign up as admin by posting role in the request body.
          //
          // emailVerified is forced true for every new account because this
          // app has no email verification flow of its own. Without this,
          // an email/password signup is left unverified, and BetterAuth's
          // account-linking requires the existing account to be verified
          // before a later Google sign-in with the same address can attach
          // to it - so a technician who signed up with email/password would
          // get locked out of that account the first time they tried
          // "Continue with Google".
          before: async (user) => {
            const role = (user as { role?: unknown }).role;
            const safeRole = role === 'customer' || role === 'technician' ? role : 'customer';
            return { data: { ...user, role: safeRole, emailVerified: true } };
          },
        },
        update: {
          // Role changes only happen through the admin role-management
          // route, never through the user's own profile/account update.
          // A hook can only add or overwrite fields in the final write, it
          // can't delete one, so the role has to be pinned back to its
          // current DB value rather than just omitted from the result.
          before: async (user, context) => {
            if ('role' in user) {
              const currentRole = (context as { context?: { session?: { user?: { role?: unknown } } } })
                ?.context?.session?.user?.role;
              return { data: { ...user, role: currentRole === 'technician' ? 'technician' : 'customer' } };
            }
          },
        },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['x-forwarded-for'],
      },
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
