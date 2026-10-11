import { app } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function start() {
  await connectDB();
  app.listen(env.PORT, () => console.log(`Server running on port ${env.PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
