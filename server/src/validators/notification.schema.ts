import { z } from 'zod';
import { pagination } from './common';

export const listNotificationsQuery = z.object({
  unread: z.enum(['true']).optional(),
  ...pagination,
});
