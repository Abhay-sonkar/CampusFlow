import dns from 'dns';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let memory: MongoMemoryServer | undefined;

// Every test file gets its own, uniquely named database, and it is deleted at the end.
// Your real "campusflow" database is never touched.
const dbName = `campusflow_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

export async function startTestDb() {
  let uri = process.env.TEST_MONGO_URI; // optional: use a MongoDB you already run (local, Docker, CI service, Atlas)
  if (uri) {
    dns.setServers(['8.8.8.8', '1.1.1.1']); // same workaround as the server, for mongodb+srv:// links
  } else {
    // Test against the same major version you run in production (Atlas is 8.0)
    memory = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION ?? '8.0.4' } });
    uri = memory.getUri();
  }
  // Fail fast (15 seconds) instead of waiting 30 seconds for every test
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
  // Build every index first: the unique indexes are what prevent double bookings and duplicate notifications
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memory) await memory.stop();
}