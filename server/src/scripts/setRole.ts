// Usage (from the server folder):
//   npx tsx src/scripts/setRole.ts staff@test.com FACULTY
// Roles: STUDENT | FACULTY | CLUB_ADMIN | COLLEGE_ADMIN
import dns from 'dns';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { ROLES, Role, User } from '../models/User';

// Same workaround as server.ts: local DNS can't resolve Atlas SRV records
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !ROLES.includes(role as Role)) {
    console.error(`Usage: npx tsx src/scripts/setRole.ts <email> <${ROLES.join('|')}>`);
    process.exit(1);
  }
  await connectDB();
  const result = await User.updateOne({ email: email.toLowerCase() }, { role });
  console.log(result.matchedCount ? `Updated ${email} -> ${role}` : `No user found with email ${email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
