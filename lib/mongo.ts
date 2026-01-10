import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}

// Global is used here to maintain a cached connection across hot reloads in development.
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db("swarmboard");
}

export async function getMissionsCollection() {
  const db = await getDb();
  return db.collection("missions");
}

export async function getEventsCollection() {
  const db = await getDb();
  return db.collection("events");
}

// Initialize indexes for idempotency
export async function ensureIndexes() {
  const events = await getEventsCollection();
  // Unique compound index to prevent duplicate steps for the same mission
  await events.createIndex(
    { missionId: 1, step: 1 },
    { unique: true, background: true }
  );
}

export default clientPromise;

