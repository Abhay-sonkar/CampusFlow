import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import applicationRoutes from './routes/application.routes';
import authRoutes from './routes/auth.routes';
import bookingRoutes from './routes/booking.routes';
import complaintRoutes from './routes/complaint.routes';
import departmentRoutes from './routes/department.routes';
import noticeRoutes from './routes/notice.routes';
import opportunityRoutes from './routes/opportunity.routes';
import resourceRoutes from './routes/resource.routes';
import userRoutes from './routes/user.routes';

export const app = express();

// 'cross-origin' lets the React app (another origin) display uploaded files
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

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

app.use(notFound);
app.use(errorHandler);
