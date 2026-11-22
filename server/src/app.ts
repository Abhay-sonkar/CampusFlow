import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { redis } from './config/redis';
import { errorHandler, notFound } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';
import adminRoutes from './routes/admin.routes';
import applicationRoutes from './routes/application.routes';
import authRoutes from './routes/auth.routes';
import bookingRoutes from './routes/booking.routes';
import complaintRoutes from './routes/complaint.routes';
import departmentRoutes from './routes/department.routes';
import noticeRoutes from './routes/notice.routes';
import notificationRoutes from './routes/notification.routes';
import opportunityRoutes from './routes/opportunity.routes';
import resourceRoutes from './routes/resource.routes';
import userRoutes from './routes/user.routes';

export const app = express();

// Behind a hosting proxy (Render, Railway...) req.ip would be the proxy's address; this reads the real client
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

// 'cross-origin' lets the React app (another origin) display uploaded files
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Not rate limited, so monitoring tools can always reach it
app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', redis: redis ? redis.status : 'disabled' });
});

// Strict limits where guessing passwords or mass-creating accounts is the risk...
app.use('/api/auth/login', rateLimit({ name: 'login', limit: 10, windowSeconds: 60 }));
app.use('/api/auth/register', rateLimit({ name: 'register', limit: 10, windowSeconds: 60 }));
// ...and a generous limit for everything else
app.use('/api', rateLimit({ name: 'global', limit: 300, windowSeconds: 60 }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);
