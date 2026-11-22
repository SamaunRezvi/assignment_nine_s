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

export async function connectDB(): Promise<Db> {
  if (db) return db;
  await client.connect();
  db = client.db(dbName);
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
