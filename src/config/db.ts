import { MongoClient, ServerApiVersion, Db } from 'mongodb';

const uri = process.env.MONGODB_URI as string;
const dbName = process.env.DB_NAME || 'fixmate';

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db: Db;

async function ensureIndexes(database: Db) {
  await Promise.all([
    database.collection('services').createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 }),
    database.collection('services').createIndex({ technicianEmail: 1 }),
    database.collection('bookings').createIndex({ customerEmail: 1, status: 1 }),
    database.collection('bookings').createIndex({ technicianEmail: 1, status: 1 }),
    database.collection('payments').createIndex({ stripeSessionId: 1 }, { unique: true }),
    database.collection('payments').createIndex({ customerEmail: 1 }),
  ]);
}

export async function connectDB(): Promise<Db> {
  if (db) return db;
  await client.connect();
  db = client.db(dbName);
  await ensureIndexes(db);
  return db;
}

export function getDB(): Db {
  if (!db) {
    throw new Error('Database not connected yet. Call connectDB() first.');
  }
  return db;
}

export const collections = {
  users: () => getDB().collection('user'),
  services: () => getDB().collection('services'),
  bookings: () => getDB().collection('bookings'),
  payments: () => getDB().collection('payments'),
};
