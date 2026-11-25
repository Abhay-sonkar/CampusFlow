import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { redis } from './config/redis';
import { openapiDocument } from './docs/openapi';
import { errorHandler, notFound } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import { sanitizeInput } from './middleware/sanitize';
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

if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' })); // a sane cap: nobody needs a 50 MB JSON body here
app.use(cookieParser());
app.use(sanitizeInput);
app.use(requestLogger);

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', redis: redis ? redis.status : 'disabled' });
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.use('/api/auth/login', rateLimit({ name: 'login', limit: 10, windowSeconds: 60 }));
app.use('/api/auth/register', rateLimit({ name: 'register', limit: 10, windowSeconds: 60 }));
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
