// Runs before every test file. These values win over anything in your real .env file.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/not-used'; // tests connect to their own throwaway database
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.REDIS_URL = ''; // tests never talk to a real Redis
process.env.SMTP_HOST = ''; // ...and never send a real email
